import { InvoiceStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/audit";
import { sendMail, mailShell, mailButton } from "@/lib/mail";
import { createInvoiceCheckoutSession } from "@/lib/billing/stripe";
import {
  claimsAwaitingPayment,
  markClaimReminderSent,
  markClaimEscalated,
  markClaimDebtorBanned,
  type CancellationClaim,
} from "@/lib/claims/store";
import { statutoryCollectionFeeCents } from "@/lib/claims/wik";
import { WIK_REMINDER_GRACE_DAYS, INCASSO_TO_BAN_DAYS } from "@/lib/claims/policy";

// ---------------------------------------------------------------------------
// WIK-conforme incasso-escalatie voor onbetaalde annuleringsclaim-facturen:
//   1. Factuur verstreken (dueAt), nog geen herinnering -> gratis wettelijke
//      14-dagenbrief (incassokosten mogen pas NA deze brief berekend worden),
//      met een verse betaallink — de oorspronkelijke Stripe Checkout-sessie
//      uit de factuurmail is na 24 uur verlopen.
//   2. 14 dagen na de herinnering nog onbetaald -> escalatie: wettelijke
//      incassokosten (lib/claims/wik.ts) worden toegevoegd, dossier gaat de
//      interne incasso-wachtrij in (admin-triage), weer met een verse
//      betaallink voor het nieuwe totaalbedrag.
//   3. 14 dagen na escalatie nog onbetaald -> platform-ban van de debiteur.
// Alles draait op de echte Invoice (Prisma, autoritatieve betaalstatus via de
// Stripe-webhook) + de KV-claim (voor debiteur-identiteit en mail-adres).
// ---------------------------------------------------------------------------

const euro = (cents: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(cents / 100);
const DAY_MS = 24 * 60 * 60 * 1000;

export interface CollectionsSweepResult {
  checked: number;
  remindersSent: number;
  escalated: number;
  banned: number;
}

async function debtorContact(claim: CancellationClaim): Promise<{ email: string; name: string; userId: string | null } | null> {
  if (claim.direction === "freelancer_owed") {
    if (!claim.debtorUserId) return null;
    const user = await prisma.user.findUnique({ where: { id: claim.debtorUserId }, select: { id: true, email: true, fullName: true } });
    if (!user) return null;
    return { email: user.email, name: user.fullName, userId: user.id };
  }
  if (!claim.debtorFreelancerId) return null;
  const profile = await prisma.freelancerProfile.findUnique({
    where: { id: claim.debtorFreelancerId },
    select: { userId: true, user: { select: { email: true, fullName: true } } },
  });
  if (!profile) return null;
  return { email: profile.user.email, name: profile.user.fullName, userId: profile.userId };
}

/** A fresh Stripe Checkout session for the given invoice/amount — the one mailed at issuance expires after 24h. */
async function freshPayLink(invoiceId: string, number: string, description: string, amountCents: number, billingEmail: string): Promise<string | null> {
  const session = await createInvoiceCheckoutSession({
    invoiceId,
    number,
    description,
    totalCents: amountCents,
    currency: "EUR",
    billingEmail,
  });
  if (session.id) await prisma.invoice.update({ where: { id: invoiceId }, data: { stripeCheckoutSessionId: session.id } });
  return session.url ?? null;
}

export async function sweepClaimCollections(): Promise<CollectionsSweepResult> {
  const claims = await claimsAwaitingPayment();
  const now = Date.now();

  let remindersSent = 0;
  let escalated = 0;
  let banned = 0;

  for (const claim of claims) {
    if (!claim.invoiceId) continue;
    try {
      const invoice = await prisma.invoice.findUnique({
        where: { id: claim.invoiceId },
        select: { id: true, number: true, status: true, dueAt: true, totalCents: true },
      });
      if (!invoice || invoice.status === InvoiceStatus.PAID || invoice.status === InvoiceStatus.CANCELLED) continue;
      if (!invoice.dueAt) continue;

      const contact = await debtorContact(claim);
      const description = `Annuleringsvergoeding — "${claim.shiftTitle}"`;

      // Stage 3: ban the debtor if still unpaid long after escalation.
      if (claim.overdueEscalatedAt && !claim.bannedAt) {
        const escalatedAt = new Date(claim.overdueEscalatedAt).getTime();
        if (now - escalatedAt >= INCASSO_TO_BAN_DAYS * DAY_MS) {
          if (contact?.userId) {
            await prisma.user.update({ where: { id: contact.userId }, data: { disabledAt: new Date() } });
            await recordAudit({
              category: "SECURITY",
              action: "claim.debtor_banned",
              severity: "warning",
              actorLabel: "system",
              summary: `${contact.name} geschorst wegens aanhoudend niet betalen van factuur ${invoice.number}`,
              targetType: "user",
              targetId: contact.userId,
              metadata: { claimId: claim.id, invoiceId: invoice.id, amountCents: invoice.totalCents },
            });
            await sendMail({
              to: contact.email,
              kind: "annuleringsclaim-factuur",
              subject: "Je ZekerFlex-account is geschorst",
              text:
                `Hoi ${contact.name},\n\nFactuur ${invoice.number} (${euro(invoice.totalCents)}, incl. wettelijke ` +
                `incassokosten) is ondanks herhaalde herinneringen niet betaald. Je account is daarom geschorst.\n\n` +
                `Betaal het openstaande bedrag en neem contact op met support@zekerflex.com om je account te laten heractiveren.\n\nZekerFlex`,
            }).catch(() => undefined);
          }
          await markClaimDebtorBanned(claim.id);
          banned += 1;
        }
        continue;
      }

      // Stage 2: escalate (statutory collection fee + internal incasso queue).
      if (claim.reminderSentAt && !claim.overdueEscalatedAt) {
        const reminderAt = new Date(claim.reminderSentAt).getTime();
        if (now - reminderAt >= WIK_REMINDER_GRACE_DAYS * DAY_MS) {
          const lateFeeCents = statutoryCollectionFeeCents(invoice.totalCents);
          const totalDueCents = invoice.totalCents + lateFeeCents;
          await prisma.invoice.update({ where: { id: invoice.id }, data: { overdueEscalatedAt: new Date(), lateFeeCents } });
          await markClaimEscalated(claim.id, lateFeeCents);
          await recordAudit({
            category: "BILLING",
            action: "claim.escalated_to_incasso",
            actorLabel: "system",
            summary: `Factuur ${invoice.number} geëscaleerd naar interne incasso (+${euro(lateFeeCents)} incassokosten)`,
            targetType: "invoice",
            targetId: invoice.id,
            metadata: { claimId: claim.id, lateFeeCents },
          });
          if (contact) {
            const payUrl = await freshPayLink(invoice.id, invoice.number, `${description} + incassokosten`, totalDueCents, contact.email).catch(() => null);
            await sendMail({
              to: contact.email,
              kind: "annuleringsclaim-factuur",
              subject: `Incasso gestart — factuur ${invoice.number}`,
              text:
                `Hoi ${contact.name},\n\nFactuur ${invoice.number} (${euro(invoice.totalCents)}) is nog steeds niet ` +
                `betaald. Er zijn nu wettelijke incassokosten van ${euro(lateFeeCents)} toegevoegd — totaal ` +
                `${euro(totalDueCents)}. Blijft dit onbetaald, dan volgt schorsing van je platformaccount.\n\n` +
                (payUrl ? `Betaal direct: ${payUrl}\n\n` : "") +
                `Zekerflex`,
              html: mailShell(
                "Incasso gestart",
                `<p style="margin:0 0 14px;font-size:15px;color:#3C4A42">Hoi ${contact.name},</p>
                 <p style="margin:0 0 14px;font-size:15px;color:#17211C">Factuur ${invoice.number} is nog steeds niet
                 betaald. Er zijn nu wettelijke incassokosten van <strong>${euro(lateFeeCents)}</strong> toegevoegd —
                 totaal <strong>${euro(totalDueCents)}</strong>.</p>
                 ${payUrl ? mailButton(payUrl, "Nu betalen") : ""}
                 <p style="margin:18px 0 0;font-size:12px;color:#667469">Blijft dit onbetaald, dan volgt schorsing
                 van je platformaccount.</p>`,
              ),
            }).catch(() => undefined);
          }
          escalated += 1;
        }
        continue;
      }

      // Stage 1: free statutory 14-day reminder once the invoice is overdue.
      if (!claim.reminderSentAt) {
        if (now - invoice.dueAt.getTime() >= 0) {
          await prisma.invoice.update({ where: { id: invoice.id }, data: { reminderSentAt: new Date() } });
          await markClaimReminderSent(claim.id);
          if (contact) {
            const expectedFee = statutoryCollectionFeeCents(invoice.totalCents);
            const payUrl = await freshPayLink(invoice.id, invoice.number, description, invoice.totalCents, contact.email).catch(() => null);
            await sendMail({
              to: contact.email,
              kind: "annuleringsclaim-factuur",
              subject: `Betalingsherinnering — factuur ${invoice.number}`,
              text:
                `Hoi ${contact.name},\n\nFactuur ${invoice.number} (${euro(invoice.totalCents)}) is nog niet betaald. ` +
                `Dit is een kosteloze herinnering: je hebt nog ${WIK_REMINDER_GRACE_DAYS} dagen om te betalen. ` +
                `Betaal je daarna nog niet, dan worden wettelijke incassokosten van ${euro(expectedFee)} in rekening gebracht.\n\n` +
                (payUrl ? `Betaal direct: ${payUrl}\n\n` : "") +
                `Zekerflex`,
              html: mailShell(
                "Betalingsherinnering",
                `<p style="margin:0 0 14px;font-size:15px;color:#3C4A42">Hoi ${contact.name},</p>
                 <p style="margin:0 0 14px;font-size:15px;color:#17211C">Factuur ${invoice.number}
                 (<strong>${euro(invoice.totalCents)}</strong>) is nog niet betaald.</p>
                 ${payUrl ? mailButton(payUrl, "Nu betalen") : ""}
                 <p style="margin:18px 0 0;font-size:13px;color:#667469">Dit is een kosteloze herinnering: je hebt
                 nog ${WIK_REMINDER_GRACE_DAYS} dagen om te betalen. Betaal je daarna nog niet, dan worden wettelijke
                 incassokosten van ${euro(expectedFee)} in rekening gebracht.</p>`,
              ),
            }).catch(() => undefined);
          }
          remindersSent += 1;
        }
      }
    } catch (err) {
      logger.warn("collections sweep failed for one claim (non-fatal)", {
        claimId: claim.id,
        error: (err as Error).message,
      });
    }
  }

  return { checked: claims.length, remindersSent, escalated, banned };
}
