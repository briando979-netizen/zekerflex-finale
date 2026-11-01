import type Stripe from "stripe";
import { InvoiceStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/audit";
import { alertOwner } from "@/lib/ops/alert";

// ---------------------------------------------------------------------------
// Storno / terugvordering.
//
// Een opdrachtgever betaalt zijn factuur via Stripe en de flexwerker is (vaak al)
// uitbetaald. Gaat dat geld later terug naar de klant, dan heeft het platform
// voorgeschoten. Wat er gebeurt hangt af van hoe het teruggaat:
//
//  - Volledige terugbetaling: de factuur staat weer open, maar de klant krijgt
//    geen herinneringen tot de eigenaar beslist. Wie terugbetaalt heeft daar vaak
//    een reden voor (foute factuur, dubbel betaald).
//  - Gedeeltelijke terugbetaling: de factuur blijft betaald. De hele factuur
//    opnieuw innen zou de klant dubbel laten betalen.
//  - Betaalgeschil: de factuur blijft betaald tot de uitkomst bekend is. Gewonnen
//    is opgelost. Verloren: de factuur gaat open en wordt opnieuw geïnd.
//
// De eigenaar krijgt altijd een melding, kritiek zodra er echt is voorgeschoten.
// ---------------------------------------------------------------------------

export type ClawbackStatus = "open" | "herincasso" | "opgelost" | "afgeschreven";

export interface Clawback {
  invoiceId: string;
  invoiceNumber: string;
  tenantId: string | null;
  amountCents: number;
  reason: string;
  /** Stripe charge or dispute: one refund or dispute is one entry, however many events Stripe sends. */
  providerRef: string | null;
  /** worker payout already settled → platform really fronted the money */
  workerPaid: boolean;
  /** The invoice is open again because of this entry, so the status also steers the invoice. */
  reopened: boolean;
  status: ClawbackStatus;
  at: string;
  resolvedAt: string | null;
}

const LOG_KEY = "clawbacks";
const DAY = 86_400_000;
const REPAY_DAYS = 7;
const euro = (cents: number) => `€${(cents / 100).toFixed(2)}`;
const idOf = (ref: string | { id: string } | null | undefined) => (typeof ref === "string" ? ref : (ref?.id ?? null));

async function all(): Promise<Clawback[]> {
  return (await kvGet<Clawback[]>(LOG_KEY).catch(() => null)) ?? [];
}

export async function listClawbacks(): Promise<Clawback[]> {
  return (await all()).sort((a, b) => b.at.localeCompare(a.at));
}

export async function openExposureCents(): Promise<number> {
  return (await all()).filter((c) => c.status === "open" || c.status === "herincasso").reduce((s, c) => s + (c.workerPaid ? c.amountCents : 0), 0);
}

/** Invoices the owner still has to decide on: no payment reminders go out for these. */
export async function invoicesOnHold(): Promise<Set<string>> {
  return new Set((await all()).filter((c) => c.reopened && c.status === "open").map((c) => c.invoiceId));
}

const INVOICE_FIELDS = { id: true, number: true, status: true, totalCents: true, recipientTenantId: true, payment: { select: { status: true } } } as const;

// One bulk checkout can carry several invoices on the same payment.
function invoicesOn(paymentIntentId: string) {
  return prisma.invoice.findMany({ where: { stripePaymentIntentId: paymentIntentId }, select: INVOICE_FIELDS });
}
type ClawbackInvoice = Awaited<ReturnType<typeof invoicesOn>>[number];

/** The client has the money back: open again, with a new term and a fresh reminder schedule. */
async function reopenInvoice(invoice: Pick<ClawbackInvoice, "id" | "status">): Promise<void> {
  if (invoice.status !== InvoiceStatus.PAID) return;
  await prisma.invoice.update({
    where: { id: invoice.id },
    data: { status: InvoiceStatus.ISSUED, paidAt: null, dueAt: new Date(Date.now() + REPAY_DAYS * DAY) },
  });
  const { resetInvoiceReminders } = await import("@/lib/billing/reminders");
  await resetInvoiceReminders(invoice.id);
}

/** Adds or updates the entry for (invoice, Stripe reference). `changed` is false when Stripe repeats itself. */
async function save(
  invoice: ClawbackInvoice,
  fields: Pick<Clawback, "amountCents" | "reason" | "providerRef" | "reopened" | "status">,
): Promise<{ entry: Clawback; changed: boolean }> {
  const list = await all();
  const existing = list.find((c) => c.invoiceId === invoice.id && c.providerRef === fields.providerRef);
  if (existing && existing.amountCents === fields.amountCents && existing.reopened === fields.reopened) return { entry: existing, changed: false };
  const entry: Clawback = {
    invoiceId: invoice.id,
    invoiceNumber: invoice.number,
    tenantId: invoice.recipientTenantId,
    workerPaid: invoice.payment?.status === "SETTLED",
    at: existing?.at ?? new Date().toISOString(),
    resolvedAt: null,
    ...fields,
  };
  await kvSet(LOG_KEY, [entry, ...list.filter((c) => c !== existing)].slice(0, 1000));
  return { entry, changed: true };
}

const numbers = (entries: Pick<Clawback, "invoiceNumber">[]) =>
  entries.length === 1 ? `factuur ${entries[0]!.invoiceNumber}` : `${entries.length} facturen (${entries.map((e) => e.invoiceNumber).join(", ")})`;

/** One audit line per invoice, one message to the owner per refund or dispute step. */
async function report(entries: Clawback[], input: { step: string; title: string; detail: string; url: string }): Promise<void> {
  if (entries.length === 0) return;
  const fronted = entries.some((e) => e.workerPaid);
  const severity = fronted ? "critical" : "warning";
  for (const entry of entries) {
    await recordAudit({
      category: "BILLING",
      action: "invoice.reversed",
      severity,
      actorLabel: "system",
      summary: `${input.title}: ${input.detail}`,
      targetType: "invoice",
      targetId: entry.invoiceId,
    }).catch(() => undefined);
  }
  await alertOwner({
    key: `clawback:${entries[0]!.providerRef}:${input.step}:${entries[0]!.amountCents}`,
    title: input.title,
    detail: `${input.detail}${fronted ? " De flexwerker was al uitbetaald, dus het platform schiet voor." : ""}`,
    severity,
    url: input.url,
  }).catch(() => undefined);
}

/** A refund or dispute on a payment that isn't an invoice. Own refunds via Admin → Shop are already handled there. */
async function reportUnmatched(kind: "refund" | "dispute", ref: string, paymentIntentId: string | null, amountCents: number): Promise<void> {
  const order = paymentIntentId
    ? await prisma.shopOrder.findUnique({ where: { stripePaymentIntentId: paymentIntentId }, select: { id: true, status: true } })
    : null;
  if (kind === "refund" && order?.status === "CANCELLED") return;
  logger.warn("clawback: no invoice for payment", { kind, ref, paymentIntentId });
  const what = kind === "refund" ? "Terugbetaling" : "Betaalgeschil";
  await alertOwner({
    key: `stripe-reversal:${ref}`,
    title: `${what} van ${euro(amountCents)} buiten de facturen`,
    detail: order ? `Dit hoort bij shopbestelling ${order.id}, die nog op ${order.status} staat. Controleer de bestelling en de voorraad.` : "Deze betaling hoort niet bij een factuur of shopbestelling. Controleer hem in Stripe.",
    severity: kind === "refund" ? "warning" : "critical",
    url: "/admin/stripe",
  }).catch(() => undefined);
}

/** Stripe `charge.refunded`: fires for every refund, also partial ones, with the running total. */
export async function recordChargeRefund(charge: Pick<Stripe.Charge, "id" | "payment_intent" | "amount_refunded" | "refunded">): Promise<void> {
  const paymentIntentId = idOf(charge.payment_intent);
  const invoices = paymentIntentId ? await invoicesOn(paymentIntentId) : [];
  if (invoices.length === 0) return reportUnmatched("refund", charge.id, paymentIntentId, charge.amount_refunded);

  if (!charge.refunded) {
    // With several invoices on one payment we can't tell which one this touches; the entry goes on the first.
    const first = invoices[0]!;
    const { entry, changed } = await save(first, { amountCents: charge.amount_refunded, reason: "Gedeeltelijke terugbetaling via Stripe", providerRef: charge.id, reopened: false, status: "open" });
    if (changed) {
      await report([entry], {
        step: "partial",
        title: `Gedeeltelijke terugbetaling op factuur ${first.number}`,
        detail: `${euro(charge.amount_refunded)} ging terug naar de klant. De factuur blijft op betaald staan en wordt niet opnieuw geïnd.`,
        url: "/admin/fraude",
      });
    }
    return;
  }

  const saved: Clawback[] = [];
  for (const invoice of invoices) {
    await reopenInvoice(invoice);
    const { entry, changed } = await save(invoice, { amountCents: invoice.totalCents, reason: "Volledig terugbetaald via Stripe", providerRef: charge.id, reopened: true, status: "open" });
    if (changed) saved.push(entry);
  }
  await report(saved, {
    step: "full",
    title: `Terugbetaling: ${numbers(saved)}`,
    detail: `Het volledige bedrag ging terug naar de klant. De factuur staat weer open, maar er gaan geen herinneringen uit tot jij kiest: opnieuw innen of afschrijven (Admin, Fraude).`,
    url: "/admin/fraude",
  });
}

type DisputeFields = Pick<Stripe.Dispute, "id" | "payment_intent" | "amount" | "reason" | "status" | "evidence_details">;

/** Stripe `charge.dispute.created`. The invoice stays paid: no reminders while the bank decides. */
export async function recordDisputeOpened(dispute: DisputeFields): Promise<void> {
  const paymentIntentId = idOf(dispute.payment_intent);
  const invoices = paymentIntentId ? await invoicesOn(paymentIntentId) : [];
  if (invoices.length === 0) return reportUnmatched("dispute", dispute.id, paymentIntentId, dispute.amount);

  const partial = dispute.amount < invoices.reduce((s, i) => s + i.totalCents, 0);
  const saved: Clawback[] = [];
  for (const invoice of partial ? invoices.slice(0, 1) : invoices) {
    const { entry, changed } = await save(invoice, { amountCents: partial ? dispute.amount : invoice.totalCents, reason: `Betaalgeschil via Stripe (${dispute.reason})`, providerRef: dispute.id, reopened: false, status: "open" });
    if (changed) saved.push(entry);
  }
  const dueBy = dispute.evidence_details?.due_by;
  await report(saved, {
    step: "opened",
    title: `Betaalgeschil: ${numbers(saved)}`,
    detail: `De klant betwist ${euro(dispute.amount)} (${dispute.reason}).${dueBy ? ` Reageer in Stripe vóór ${new Date(dueBy * 1000).toLocaleDateString("nl-NL")}.` : ""} De factuur blijft op betaald staan tot de uitkomst bekend is.`,
    url: "/admin/stripe",
  });
}

/** Stripe `charge.dispute.closed`: won means the money is back, lost means collecting it again. */
export async function recordDisputeClosed(dispute: DisputeFields): Promise<void> {
  const won = dispute.status === "won" || dispute.status === "warning_closed" || dispute.status === "prevented";
  if (!won && dispute.status !== "lost") {
    logger.info("clawback: dispute closed without a result to act on", { dispute: dispute.id, status: dispute.status });
    return;
  }
  // The opening can be missing, e.g. a dispute from before these events were on.
  if (!(await all()).some((c) => c.providerRef === dispute.id)) await recordDisputeOpened(dispute);

  const entries = (await all()).filter((c) => c.providerRef === dispute.id);
  const invoices = await prisma.invoice.findMany({ where: { id: { in: entries.map((e) => e.invoiceId) } }, select: INVOICE_FIELDS });
  const outcome = won ? "gewonnen" : "verloren";
  const updated: Clawback[] = [];
  for (const entry of entries) {
    const invoice = invoices.find((i) => i.id === entry.invoiceId);
    if (!invoice || entry.reason.endsWith(outcome)) continue; // Stripe repeats itself
    const reopen = !won && entry.amountCents >= invoice.totalCents;
    if (reopen) await reopenInvoice(invoice);
    updated.push({ ...entry, reason: `${entry.reason}: ${outcome}`, reopened: reopen, status: won ? "opgelost" : reopen ? "herincasso" : "open", resolvedAt: won ? new Date().toISOString() : null });
  }
  if (updated.length === 0) return;

  const list = await all();
  await kvSet(LOG_KEY, list.map((c) => updated.find((u) => u.invoiceId === c.invoiceId && u.providerRef === c.providerRef) ?? c));
  await report(updated, won
    ? { step: "won", title: `Betaalgeschil gewonnen: ${numbers(updated)}`, detail: "Het geld blijft bij ons en de factuur blijft betaald. Niets te doen.", url: "/admin/stripe" }
    : updated.some((u) => u.reopened)
      ? { step: "lost", title: `Betaalgeschil verloren: ${numbers(updated)}`, detail: `De bank gaf de klant gelijk. De factuur staat weer open met ${REPAY_DAYS} dagen betaaltermijn en wordt opnieuw geïnd.`, url: "/admin/fraude" }
      : { step: "lost", title: `Betaalgeschil verloren: ${numbers(updated)}`, detail: `De klant kreeg ${euro(dispute.amount)} terug, een deel van het factuurbedrag. De factuur blijft op betaald staan; verreken dit met de klant.`, url: "/admin/fraude" });
}

/** The reopened invoice has been paid again, which settles the entry. */
export async function settleClawbacks(invoiceId: string): Promise<void> {
  const list = await all();
  const settles = (c: Clawback) => c.invoiceId === invoiceId && c.reopened && (c.status === "open" || c.status === "herincasso");
  if (!list.some(settles)) return;
  await kvSet(LOG_KEY, list.map((c) => (settles(c) ? { ...c, status: "opgelost" as const, resolvedAt: new Date().toISOString() } : c)));
}

/** The owner's choice in Admin → Fraude. For a reopened invoice that choice also decides the invoice. */
export async function setClawbackStatus(invoiceId: string, status: ClawbackStatus): Promise<void> {
  const list = await all();
  const closed = status === "opgelost" || status === "afgeschreven";
  const next = list.map((c) => (c.invoiceId === invoiceId ? { ...c, status, resolvedAt: closed ? new Date().toISOString() : null } : c));
  await kvSet(LOG_KEY, next);
  if (!list.some((c) => c.invoiceId === invoiceId && c.reopened)) return;
  const invoiceStatus = status === "afgeschreven" ? InvoiceStatus.CANCELLED : status === "opgelost" ? InvoiceStatus.PAID : InvoiceStatus.ISSUED;
  await prisma.invoice.update({ where: { id: invoiceId }, data: { status: invoiceStatus, paidAt: invoiceStatus === InvoiceStatus.PAID ? new Date() : null } });
}
