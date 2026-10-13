import { InvoiceStatus, InvoiceType, VatTreatment } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { sendMail, mailShell, mailButton } from "@/lib/mail";
import { nextInvoiceNumber } from "@/lib/billing/numbering";
import { createInvoiceCheckoutSession } from "@/lib/billing/stripe";
import { getOrgProfileExtra } from "@/lib/profile/store";
import { attachClaimInvoice, type CancellationClaim } from "@/lib/claims/store";
import { INVOICE_DUE_DAYS } from "@/lib/claims/policy";

const euro = (cents: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(cents / 100);

/**
 * Turns a decided cancellation claim into a real, payable invoice: a Stripe
 * Checkout pay link, mailed directly to the debtor. Called right after
 * decideClaim("approved") (freelancer_owed) or decideOfferedClaim("accepted")
 * (employer_owed) — never on mere filing, since nothing is owed until the
 * other side has actually accepted the claim.
 *
 * A contractual penalty like this isn't a supply of goods/services, so it's
 * out of scope for VAT (no vatCents).
 */
export async function issueClaimInvoice(claim: CancellationClaim): Promise<{ invoiceId: string; checkoutUrl: string }> {
  if (claim.invoiceId) throw AppError.conflict("Voor deze claim is al een factuur aangemaakt.");

  const isFreelancerOwed = claim.direction === "freelancer_owed";

  let billingEmail: string | null = null;
  let debtorName = "";
  if (isFreelancerOwed) {
    const extra = await getOrgProfileExtra(claim.employerTenantId);
    billingEmail = extra.billingEmail ?? null;
    const tenant = await prisma.tenant.findUnique({ where: { id: claim.employerTenantId }, select: { name: true } });
    debtorName = tenant?.name ?? claim.branchName;
  } else {
    if (!claim.debtorFreelancerId) throw AppError.validation("Geen freelancer gekoppeld aan deze claim.");
    const profile = await prisma.freelancerProfile.findUnique({
      where: { id: claim.debtorFreelancerId },
      select: { user: { select: { email: true, fullName: true } } },
    });
    if (!profile) throw AppError.notFound("Freelancer niet gevonden.");
    billingEmail = profile.user.email;
    debtorName = profile.user.fullName;
  }

  const description = isFreelancerOwed
    ? `Annuleringsvergoeding (50%) — "${claim.shiftTitle}" bij ${claim.branchName}`
    : `Vergoeding voor te laat afgezegde/niet-opgekomen dienst (50%) — "${claim.shiftTitle}"`;

  const now = new Date();
  const dueAt = new Date(now.getTime() + INVOICE_DUE_DAYS * 24 * 60 * 60 * 1000);

  const invoice = await prisma.$transaction(async (tx) => {
    const number = await nextInvoiceNumber(tx, InvoiceType.CANCELLATION_PENALTY, now);
    const created = await tx.invoice.create({
      data: {
        number,
        type: InvoiceType.CANCELLATION_PENALTY,
        status: InvoiceStatus.ISSUED,
        claimId: claim.id,
        recipientTenantId: isFreelancerOwed ? claim.employerTenantId : null,
        recipientFreelancerId: isFreelancerOwed ? null : claim.debtorFreelancerId,
        currency: "EUR",
        vatTreatment: VatTreatment.OUT_OF_SCOPE,
        vatRate: 0,
        subtotalCents: claim.claimedCents,
        vatCents: 0,
        totalCents: claim.claimedCents,
        issuedAt: now,
        dueAt,
        lines: { create: [{ description, quantity: 1, unitPriceCents: claim.claimedCents, amountCents: claim.claimedCents }] },
      },
    });
    return created;
  });

  const session = await createInvoiceCheckoutSession({
    invoiceId: invoice.id,
    number: invoice.number,
    description,
    totalCents: invoice.totalCents,
    currency: invoice.currency,
    billingEmail,
  });
  await prisma.invoice.update({ where: { id: invoice.id }, data: { stripeCheckoutSessionId: session.id } });
  await attachClaimInvoice(claim.id, invoice.id);

  if (!session.url) throw AppError.upstream("Stripe gaf geen checkout-url terug");

  if (billingEmail) {
    await sendMail({
      to: billingEmail,
      kind: "annuleringsclaim-factuur",
      subject: `Factuur ${invoice.number} — ${description}`,
      text:
        `Hoi ${debtorName},\n\n${description}.\n\nBedrag: ${euro(invoice.totalCents)}\n` +
        `Te betalen voor: ${dueAt.toLocaleDateString("nl-NL")}\n\nBetaal direct: ${session.url}\n\n` +
        `Niet op tijd betaald? Dan volgt een gratis betalingsherinnering, en bij aanhoudend ` +
        `niet betalen kunnen wettelijke incassokosten en uiteindelijk een schorsing van je ` +
        `platformaccount volgen.\n\nZekerFlex`,
      html: mailShell(
        "Factuur",
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#3C4A42">Hoi ${debtorName},</p>
         <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#17211C">${description}.</p>
         <p style="margin:0 0 4px;font-size:15px;color:#17211C"><strong>Bedrag: ${euro(invoice.totalCents)}</strong></p>
         <p style="margin:0 0 18px;font-size:13px;color:#667469">Te betalen voor ${dueAt.toLocaleDateString("nl-NL")}</p>
         ${mailButton(session.url, "Nu betalen")}
         <p style="margin:18px 0 0;font-size:12px;color:#667469">Niet op tijd betaald? Dan volgt een gratis
         betalingsherinnering, en bij aanhoudend niet betalen kunnen wettelijke incassokosten en uiteindelijk
         een schorsing van je platformaccount volgen.</p>`,
      ),
    }).catch(() => undefined);
  }

  await recordAudit({
    category: "BILLING",
    action: "claim.invoice_issued",
    actorLabel: "system",
    summary: `Factuur ${invoice.number} aangemaakt voor claim ${claim.id} (${euro(invoice.totalCents)}, richting ${claim.direction})`,
    targetType: "invoice",
    targetId: invoice.id,
    metadata: { claimId: claim.id, direction: claim.direction, amountCents: invoice.totalCents },
  });

  return { invoiceId: invoice.id, checkoutUrl: session.url };
}
