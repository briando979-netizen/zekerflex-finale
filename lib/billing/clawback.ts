import { InvoiceStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/audit";
import { alertOwner } from "@/lib/ops/alert";

// ---------------------------------------------------------------------------
// Storno / terugvordering.
//
// Een opdrachtgever betaalt zijn factuur (Stripe), de factuur wordt op PAID
// gezet en de flexwerker is (vaak al) uitbetaald. Wordt die Stripe-betaling
// daarna teruggeboekt of gedisputeerd (refund / chargeback / SEPA-return), dan
// heeft het platform geld voorgeschoten. Dit zet de factuur terug op openstaand
// zodat de bestaande dunning (runInvoiceReminders) hem opnieuw int, legt een
// terugvordering vast met de exposure (is de flexwerker al betaald?), en
// waarschuwt de eigenaar — kritiek zodra er daadwerkelijk is voorgeschoten.
// ---------------------------------------------------------------------------

export type ClawbackStatus = "open" | "herincasso" | "opgelost" | "afgeschreven";

export interface Clawback {
  invoiceId: string;
  invoiceNumber: string;
  tenantId: string | null;
  amountCents: number;
  reason: string;
  providerRef: string | null;
  /** worker payout already settled → platform really fronted the money */
  workerPaid: boolean;
  status: ClawbackStatus;
  at: string;
  resolvedAt: string | null;
}

const LOG_KEY = "clawbacks";

async function all(): Promise<Clawback[]> {
  return (await kvGet<Clawback[]>(LOG_KEY).catch(() => null)) ?? [];
}

export async function listClawbacks(): Promise<Clawback[]> {
  return (await all()).sort((a, b) => b.at.localeCompare(a.at));
}

export async function openExposureCents(): Promise<number> {
  return (await all()).filter((c) => c.status === "open" || c.status === "herincasso").reduce((s, c) => s + (c.workerPaid ? c.amountCents : 0), 0);
}

/** Record a reversal of a paid invoice. Idempotent per (invoiceId, providerRef). */
export async function recordInvoiceReversal(input: { invoiceId: string; reason: string; providerRef?: string | null }): Promise<Clawback | null> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: input.invoiceId },
    select: { id: true, number: true, status: true, totalCents: true, recipientTenantId: true, payment: { select: { status: true } } },
  });
  if (!invoice) {
    logger.warn("clawback: invoice not found", { invoiceId: input.invoiceId });
    return null;
  }

  const list = await all();
  const existing = list.find((c) => c.invoiceId === invoice.id && c.providerRef === (input.providerRef ?? null));
  if (existing) return existing;

  // put the invoice back to collectible so dunning re-collects it
  if (invoice.status === InvoiceStatus.PAID) {
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: InvoiceStatus.ISSUED, paidAt: null, dueAt: new Date(Date.now() + 7 * 86_400_000) },
    });
  }

  const workerPaid = invoice.payment?.status === "SETTLED";
  const entry: Clawback = {
    invoiceId: invoice.id,
    invoiceNumber: invoice.number,
    tenantId: invoice.recipientTenantId,
    amountCents: invoice.totalCents,
    reason: input.reason,
    providerRef: input.providerRef ?? null,
    workerPaid,
    status: "open",
    at: new Date().toISOString(),
    resolvedAt: null,
  };
  await kvSet(LOG_KEY, [entry, ...list].slice(0, 1000));

  await recordAudit({
    category: "BILLING",
    action: "invoice.reversed",
    severity: workerPaid ? "critical" : "warning",
    actorLabel: "system",
    summary: `Terugboeking factuur ${invoice.number} (${(invoice.totalCents / 100).toFixed(2)}): ${input.reason}.${workerPaid ? " Flexwerker was al uitbetaald — voorgeschoten." : ""}`,
    targetType: "invoice",
    targetId: invoice.id,
  }).catch(() => undefined);

  await alertOwner({
    key: `clawback:${invoice.id}`,
    title: `Storno: factuur ${invoice.number} teruggeboekt`,
    detail: `${input.reason}. Bedrag €${(invoice.totalCents / 100).toFixed(2)}.${workerPaid ? " De flexwerker was al uitbetaald — het platform schiet voor. Herincasso gestart." : " De flexwerker was nog niet uitbetaald."}`,
    severity: workerPaid ? "critical" : "warning",
    url: "/admin/bank",
  }).catch(() => undefined);

  return entry;
}

/** Resolve a stripe charge/dispute to its invoice via the stored payment-intent, then record the reversal. */
export async function reverseByPaymentIntent(paymentIntentId: string, reason: string, providerRef?: string | null): Promise<Clawback | null> {
  const invoice = await prisma.invoice.findFirst({ where: { stripePaymentIntentId: paymentIntentId }, select: { id: true } });
  if (!invoice) {
    logger.warn("clawback: no invoice for payment intent", { paymentIntentId });
    return null;
  }
  return recordInvoiceReversal({ invoiceId: invoice.id, reason, providerRef: providerRef ?? paymentIntentId });
}

export async function setClawbackStatus(invoiceId: string, status: ClawbackStatus): Promise<void> {
  const list = await all();
  const next = list.map((c) => (c.invoiceId === invoiceId ? { ...c, status, resolvedAt: status === "opgelost" || status === "afgeschreven" ? new Date().toISOString() : c.resolvedAt } : c));
  await kvSet(LOG_KEY, next);
}
