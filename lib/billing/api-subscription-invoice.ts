import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/audit";
import { sendMail, mailShell } from "@/lib/mail";
import { claimIdempotency } from "@/lib/redis";
import { recipientsFor } from "@/lib/billing/reminders";

/** Het Stripe-abonnement waar een factuur bij hoort, of null (losse factuur zonder abonnement). */
export function abonnementVanFactuur(invoice: Stripe.Invoice): { id: string; metadata: Stripe.Metadata } | null {
  const details = invoice.parent?.subscription_details;
  const sub = details?.subscription;
  const id = typeof sub === "string" ? sub : sub?.id;
  if (!id) return null;
  return { id, metadata: { ...(typeof sub === "object" ? sub.metadata : {}), ...(details?.metadata ?? {}) } };
}

/** Beheerde website en netwerkpakketten hebben een eigen tak (metadata-sleutel); alleen het API-abonnement is hier. */
function isEigenTak(metadata: Stripe.Metadata): boolean {
  return Boolean(metadata.managedWebsiteTenantId || metadata.netwerkTenantId);
}

const euro = (cents: number) => `€ ${(cents / 100).toFixed(2).replace(".", ",")}`;

/**
 * Webhook `invoice.payment_failed` voor een API-abonnement: de maandincasso is mislukt →
 * status `past_due` (dan geldt het gratis plan, zie lib/api-plans/resolve.ts) en de beheerders
 * van het bedrijf krijgen één mail per factuur. Idempotent: een geannuleerd abonnement blijft
 * geannuleerd, een al achterstallig abonnement wordt niet nogmaals gemeld en de mail gaat per
 * factuur hooguit één keer uit (ook als Stripe dubbel stuurt).
 */
export async function abonnementBetalingMislukt(invoice: Stripe.Invoice): Promise<{ matched: boolean }> {
  const sub = abonnementVanFactuur(invoice);
  if (!sub || isEigenTak(sub.metadata)) return { matched: false };
  const existing = await prisma.apiSubscription.findUnique({ where: { stripeSubscriptionId: sub.id } });
  if (!existing) {
    logger.warn("invoice.payment_failed for unknown stripeSubscriptionId", { subscriptionId: sub.id });
    return { matched: false };
  }
  if (existing.status === "canceled") return { matched: true };

  if (existing.status !== "past_due") {
    await prisma.apiSubscription.update({ where: { id: existing.id }, data: { status: "past_due" } });
    await recordAudit({
      category: "BILLING",
      action: "api_subscription.past_due",
      actorLabel: "integration:stripe",
      summary: `Betaling van het API-abonnement van tenant ${existing.tenantId} mislukt (${euro(invoice.amount_due)})`,
      targetType: "tenant",
      targetId: existing.tenantId,
      metadata: { stripeSubscriptionId: sub.id, stripeInvoiceId: invoice.id, attemptCount: invoice.attempt_count },
    });
  }

  // Eén mail per factuur; valt de opslag uit, dan liever geen mail dan een dubbele.
  let eerste = false;
  try {
    eerste = invoice.id ? await claimIdempotency(`abonnement-achterstand:${invoice.id}`, 14 * 24 * 60 * 60) : false;
  } catch (err) {
    logger.warn("past-due mail skipped: idempotency store unavailable", { error: (err as Error).message });
  }
  if (!eerste) return { matched: true };

  const tenant = await prisma.tenant.findUnique({ where: { id: existing.tenantId }, select: { name: true } });
  const naam = tenant?.name ?? "je bedrijf";
  const betaalUrl = invoice.hosted_invoice_url ?? `${env.APP_BASE_URL.replace(/\/+$/, "")}/werkgever/facturen`;
  const opnieuw = invoice.next_payment_attempt ? "Stripe probeert de betaling binnenkort automatisch opnieuw. " : "";
  const tekst = `Hoi,\n\nDe maandelijkse betaling van het abonnement van ${naam} (${euro(invoice.amount_due)}) is niet gelukt. ${opnieuw}Zolang dit openstaat, valt het abonnement terug op het gratis plan.\n\nBetaal de factuur of werk je betaalmethode bij via: ${betaalUrl}\n\nMet vriendelijke groet,\nZekerFlex`;
  const html = mailShell(
    "Betaling van je abonnement mislukt",
    `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#3C4A42">De maandelijkse betaling van het abonnement van <strong>${naam.replace(/</g, "&lt;")}</strong> (${euro(invoice.amount_due)}) is niet gelukt. ${opnieuw}Zolang dit openstaat, valt het abonnement terug op het gratis plan.</p><p style="margin:0"><a href="${betaalUrl}" style="font-size:14px;color:#0E5C4A;font-weight:600">Betaal de factuur of werk je betaalmethode bij</a></p>`,
  );
  for (const to of await recipientsFor(existing.tenantId)) {
    await sendMail({ to, from: env.MAIL_FROM, kind: "abonnement-achterstand", subject: "Betaling van je ZekerFlex-abonnement mislukt", text: tekst, html }).catch((e) =>
      logger.warn("past-due mail failed", { error: (e as Error).message }),
    );
  }
  return { matched: true };
}

/**
 * Webhook `invoice.paid` voor een API-abonnement: een achterstallig abonnement is weer actief.
 * Idempotent: alleen `past_due` springt terug; `active` blijft staan en `canceled` wordt nooit
 * heropend (een nieuw abonnement komt via de checkout).
 */
export async function abonnementFactuurBetaald(invoice: Stripe.Invoice): Promise<{ matched: boolean }> {
  const sub = abonnementVanFactuur(invoice);
  if (!sub || isEigenTak(sub.metadata)) return { matched: false };
  const existing = await prisma.apiSubscription.findUnique({ where: { stripeSubscriptionId: sub.id } });
  if (!existing) return { matched: false };
  if (existing.status !== "past_due") return { matched: true };

  const res = await prisma.apiSubscription.updateMany({ where: { id: existing.id, status: "past_due" }, data: { status: "active" } });
  if (res.count > 0) {
    await recordAudit({
      category: "BILLING",
      action: "api_subscription.recovered",
      actorLabel: "integration:stripe",
      summary: `API-abonnement van tenant ${existing.tenantId} weer actief na betaling`,
      targetType: "tenant",
      targetId: existing.tenantId,
      metadata: { stripeSubscriptionId: sub.id, stripeInvoiceId: invoice.id },
    });
  }
  return { matched: true };
}
