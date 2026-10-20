import { InvoiceStatus, InvoiceType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/audit";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { getOrgProfileExtra } from "@/lib/profile/store";
import { INVOICE_DUE_DAYS } from "@/lib/claims/policy";
import { payUrl } from "@/lib/billing/pay-link";

// ---------------------------------------------------------------------------
// Payment reminders for client invoices (hours + platform fee + uitzend):
// standard-speed freelancers are only paid once the client pays, so a late
// invoice means someone waits for their wage. Due date = issued + 14 days
// (general terms, art. 4). Schedule after the due date:
//   +3 days  friendly reminder with ONE pay link for everything open
//   +10 days second, firmer reminder ("flexwerkers wachten op hun geld")
//   +17 days escalate to the owner (push + mail) and list it as overdue
// One mail per company. No automatic fees or blocking — that is the owner's
// call. Cancellation-penalty invoices keep their own WIK flow (lib/claims).
// ---------------------------------------------------------------------------

const DAY = 86_400_000;
export const REMINDER_STAGES = [
  { stage: 1, afterDueDays: 3 },
  { stage: 2, afterDueDays: 10 },
  { stage: 3, afterDueDays: 17 },
] as const;
const COLLECTED_TYPES: InvoiceType[] = [InvoiceType.SELF_BILL_FREELANCER, InvoiceType.PLATFORM_FEE, InvoiceType.UITZEND_FEE];

interface ReminderState {
  stage: number;
  at: string;
}
const stateKey = (invoiceId: string) => `invoice-reminder:${invoiceId}`;
const euro = (c: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(c / 100);
const dateNl = (d: Date) => d.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });

export const dueDateOf = (inv: { dueAt: Date | null; issuedAt: Date | null; createdAt: Date }) =>
  inv.dueAt ?? new Date((inv.issuedAt ?? inv.createdAt).getTime() + INVOICE_DUE_DAYS * DAY);

/** Highest stage an invoice has reached by `now` (0 = not yet due for a reminder). */
export function stageFor(due: Date, now: Date): number {
  const daysLate = (now.getTime() - due.getTime()) / DAY;
  let s = 0;
  for (const r of REMINDER_STAGES) if (daysLate >= r.afterDueDays) s = r.stage;
  return s;
}

export interface OverdueInvoice {
  id: string;
  number: string;
  totalCents: number;
  dueAt: string;
  daysLate: number;
  stage: number; // reminders sent so far
  tenantId: string;
  tenantName: string;
}

async function openInvoices() {
  return prisma.invoice.findMany({
    where: { status: InvoiceStatus.ISSUED, type: { in: COLLECTED_TYPES }, recipientTenantId: { not: null }, totalCents: { gt: 0 } },
    select: { id: true, number: true, totalCents: true, dueAt: true, issuedAt: true, createdAt: true, recipientTenantId: true, recipientTenant: { select: { name: true } } },
    take: 5000,
  });
}

/** Overdue client invoices with how far the reminder flow got — for the admin list. */
export async function overdueInvoices(now = new Date()): Promise<OverdueInvoice[]> {
  const out: OverdueInvoice[] = [];
  for (const inv of await openInvoices()) {
    const due = dueDateOf(inv);
    if (due > now) continue;
    const st = await kvGet<ReminderState>(stateKey(inv.id));
    out.push({ id: inv.id, number: inv.number, totalCents: inv.totalCents, dueAt: due.toISOString(), daysLate: Math.floor((now.getTime() - due.getTime()) / DAY), stage: st?.stage ?? 0, tenantId: inv.recipientTenantId!, tenantName: inv.recipientTenant?.name ?? "—" });
  }
  return out.sort((a, b) => b.daysLate - a.daysLate);
}

/** Billing contact, or else the company's admins (most employers never fill in a separate billing address). */
export async function recipientsFor(tenantId: string): Promise<string[]> {
  const extra = await getOrgProfileExtra(tenantId);
  if (extra.billingEmail) return [extra.billingEmail];
  const admins = await prisma.membership.findMany({ where: { tenantId, role: "HQ_ADMIN", user: { disabledAt: null } }, select: { user: { select: { email: true } } }, take: 3 });
  return [...new Set(admins.map((a) => a.user.email))];
}

/** Permanent pay links (/betaal/<id>.<sig>) — a Stripe session made now would expire after 24 h. */
function reminderMail(stage: 1 | 2, orgName: string, rows: { id: string; number: string; totalCents: number; due: Date }[]) {
  const total = rows.reduce((s, r) => s + r.totalCents, 0);
  const list = rows.map((r) => `- ${r.number}: ${euro(r.totalCents)} (vervallen op ${dateNl(r.due)})\n  Betalen: ${payUrl(r.id)}`).join("\n");
  const subject = stage === 1 ? `Herinnering: ${rows.length === 1 ? "factuur" : `${rows.length} facturen`} open — ${euro(total)}` : `Tweede herinnering: ${euro(total)} staat nog open`;
  const intro =
    stage === 1
      ? `Hoi,\n\nMisschien is het aan je aandacht ontsnapt: voor ${orgName} ${rows.length === 1 ? "staat nog een factuur" : `staan nog ${rows.length} facturen`} open op ZekerFlex.`
      : `Hoi,\n\nWe hebben nog geen betaling ontvangen voor de onderstaande ${rows.length === 1 ? "factuur" : "facturen"} van ${orgName}. De flexwerkers die voor jullie hebben gewerkt, krijgen hun loon pas als deze betaling binnen is.`;
  const outro =
    stage === 1
      ? "Al betaald? Dan kruisen onze berichten elkaar en kun je deze mail negeren."
      : "Is er iets niet in orde met een factuur? Antwoord dan op deze mail of neem contact op met support, dan zoeken we het samen uit. Blijft betaling uit, dan nemen we persoonlijk contact op en kunnen we nieuwe klussen tijdelijk pauzeren.";
  return {
    subject,
    text: `${intro}\n\n${list}\n\nTotaal: ${euro(total)}\n\nBetalen kan per factuur met de link erachter (iDEAL of creditcard), of alles tegelijk op ${env.APP_BASE_URL.replace(/\/+$/, "")}/werkgever/facturen.\n\n${outro}\n\nMet vriendelijke groet,\nZekerFlex`,
  };
}

export interface ReminderRunResult {
  checked: number;
  mailed: number;
  escalated: number;
  disabled?: boolean;
}

// Automatic reminders mail clients, so the owner switches them on deliberately
// (Admin → Facturen) after checking the open invoices. Default: off.
const SETTING_KEY = "invoice-reminders:settings";
export async function getReminderSettings(): Promise<{ enabled: boolean }> {
  return (await kvGet<{ enabled: boolean }>(SETTING_KEY)) ?? { enabled: false };
}
export async function setReminderSettings(enabled: boolean, adminUserId: string): Promise<void> {
  await kvSet(SETTING_KEY, { enabled });
  await recordAudit({ category: "BILLING", action: enabled ? "invoice.reminders_enabled" : "invoice.reminders_disabled", actorUserId: adminUserId, actorLabel: "user", summary: `Automatische betaalherinneringen ${enabled ? "aangezet" : "uitgezet"}`, targetType: "setting", targetId: SETTING_KEY });
}

/** Daily: advance every overdue client invoice one step through the reminder flow. */
export async function runInvoiceReminders(now = new Date()): Promise<ReminderRunResult> {
  if (!(await getReminderSettings()).enabled) return { checked: 0, mailed: 0, escalated: 0, disabled: true };
  const invoices = await openInvoices();
  // per company: invoices that reached a stage beyond what we already did
  const byTenant = new Map<string, { name: string; rows: { id: string; number: string; totalCents: number; due: Date; target: number; done: number }[] }>();
  for (const inv of invoices) {
    const due = dueDateOf(inv);
    const target = stageFor(due, now);
    if (target === 0) continue;
    const done = (await kvGet<ReminderState>(stateKey(inv.id)))?.stage ?? 0;
    const t = byTenant.get(inv.recipientTenantId!) ?? { name: inv.recipientTenant?.name ?? "jullie organisatie", rows: [] };
    t.rows.push({ id: inv.id, number: inv.number, totalCents: inv.totalCents, due, target, done });
    byTenant.set(inv.recipientTenantId!, t);
  }

  let mailed = 0;
  let escalated = 0;
  const { sendMail } = await import("@/lib/mail");
  for (const [tenantId, t] of byTenant) {
    // One step at a time per invoice (never skip a reminder): an invoice that is
    // already very late when it first shows up — e.g. on the day this goes live —
    // still gets reminder 1, then 2 on a later run, before the owner is alerted.
    const pending = t.rows.filter((r) => r.target > r.done).map((r) => ({ ...r, next: Math.min(r.target, r.done + 1) }));
    if (pending.length === 0) continue;
    const step = Math.max(...pending.map((r) => r.next)) as 1 | 2 | 3;
    try {
      if (step === 3) {
        const late = pending.filter((r) => r.next === 3);
        const total = late.reduce((s, r) => s + r.totalCents, 0);
        const { alertOwner } = await import("@/lib/ops/alert");
        await alertOwner({
          key: `invoice-overdue:${tenantId}`,
          title: `${t.name}: ${euro(total)} ruim over de betaaltermijn`,
          detail: `${late.length} factu${late.length === 1 ? "ur" : "ren"} meer dan 17 dagen te laat, 2 herinneringen gestuurd zonder resultaat. Neem persoonlijk contact op of pauzeer nieuwe klussen.`,
          severity: "warning",
          url: "/admin/facturen",
        });
        escalated++;
      } else {
        const to = await recipientsFor(tenantId);
        if (to.length === 0) {
          logger.warn("invoice reminder: no recipient", { tenantId });
          continue;
        }
        // remind about everything that's overdue, not only the newest
        const mail = reminderMail(step, t.name, t.rows);
        for (const addr of to) await sendMail({ to: addr, subject: mail.subject, text: mail.text, kind: "invoice-reminder" });
        mailed++;
      }
      for (const r of pending) await kvSet(stateKey(r.id), { stage: r.next, at: now.toISOString() } satisfies ReminderState);
      await recordAudit({ category: "BILLING", action: step === 3 ? "invoice.overdue_escalated" : "invoice.reminder_sent", actorLabel: "system:invoice-reminders", summary: `${t.name}: ${step === 3 ? "geëscaleerd naar beheer" : `${step === 1 ? "eerste" : "tweede"} betaalherinnering`} (${pending.length} factu${pending.length === 1 ? "ur" : "ren"})`, targetType: "tenant", targetId: tenantId });
    } catch (err) {
      logger.error("invoice reminder failed", { tenantId, error: (err as Error).message });
    }
  }
  return { checked: invoices.length, mailed, escalated };
}

/** Admin: send the next reminder for one company right now (ignores the schedule, never skips stage 1). */
export async function remindTenantNow(tenantId: string, adminUserId: string): Promise<boolean> {
  const now = new Date();
  const rows = (await overdueInvoices(now)).filter((i) => i.tenantId === tenantId);
  if (rows.length === 0) return false;
  const to = await recipientsFor(tenantId);
  if (to.length === 0) return false;
  const step: 1 | 2 = rows.some((r) => r.stage >= 1) ? 2 : 1;
  const mail = reminderMail(step, rows[0]!.tenantName, rows.map((r) => ({ id: r.id, number: r.number, totalCents: r.totalCents, due: new Date(r.dueAt) })));
  const { sendMail } = await import("@/lib/mail");
  for (const addr of to) await sendMail({ to: addr, subject: mail.subject, text: mail.text, kind: "invoice-reminder" });
  for (const r of rows) await kvSet(stateKey(r.id), { stage: Math.max(r.stage, step), at: now.toISOString() } satisfies ReminderState);
  await recordAudit({ category: "BILLING", action: "invoice.reminder_sent_manual", actorUserId: adminUserId, actorLabel: "user", summary: `${rows[0]!.tenantName}: betaalherinnering handmatig verstuurd`, targetType: "tenant", targetId: tenantId });
  return true;
}
