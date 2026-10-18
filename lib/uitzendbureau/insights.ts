import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { listRuns, getRun } from "@/lib/payroll/store";

// ---------------------------------------------------------------------------
// The uitzendbureau, worked out: the pool of uitzendkrachten with their ABU
// phase and the signals that need action before a legal threshold (fase B
// at 52 weeks, fase C at 208, STIPP-plus pension), the numbers per client
// (revenue, hours, markup) and a markup rate per client.
//   key "uitzend-markup:<tenantId>" → rate (e.g. 0.38)
// ---------------------------------------------------------------------------

export interface PoolWorker {
  userId: string;
  name: string;
  email: string | null;
  weeksWorked: number;
  phase: "A" | "B" | "C";
  lastWeek: string;
  lastWeekGrossCents: number;
  lastWeekHours: number;
}

export interface Signal {
  userId: string;
  name: string;
  level: "info" | "warn";
  text: string;
}

export const phaseFor = (weeks: number): PoolWorker["phase"] => (weeks > 208 ? "C" : weeks > 52 ? "B" : "A");

/** Signals for thresholds coming up within ~4 weeks (ABU-cao fasen + STIPP). */
export function signalsFor(w: Pick<PoolWorker, "userId" | "name" | "weeksWorked">): Signal[] {
  const out: Signal[] = [];
  const n = w.weeksWorked;
  if (n >= 48 && n <= 52) out.push({ userId: w.userId, name: w.name, level: "warn", text: `Week ${n} van 52: over ${52 - n} week naar fase B — het uitzendbeding vervalt, er is een tijdelijk contract nodig.` });
  if (n >= 204 && n <= 208) out.push({ userId: w.userId, name: w.name, level: "warn", text: `Week ${n} van 208: over ${208 - n} week naar fase C — recht op een contract voor onbepaalde tijd.` });
  if (n >= 6 && n <= 8) out.push({ userId: w.userId, name: w.name, level: "info", text: `Week ${n}: vanaf week 9 start de STIPP-basispensioenregeling.` });
  if (n >= 48 && n <= 52) out.push({ userId: w.userId, name: w.name, level: "info", text: "Rond week 52 gaat STIPP over naar de plusregeling (afhankelijk van leeftijd en gewerkte weken)." });
  return out;
}

/** The uitzendkrachten in the most recent payroll runs, with phase and last week. */
export async function workerPool(): Promise<{ workers: PoolWorker[]; signals: Signal[] }> {
  const runs = await listRuns(8);
  const byUser = new Map<string, PoolWorker>();
  for (const summary of runs) {
    const run = await getRun(summary.isoWeek);
    if (!run) continue;
    for (const p of run.payslips) {
      if (p.computed.breakdown.kind !== "payroll" || byUser.has(p.userId)) continue;
      const hours = p.computed.totalHours ?? 0;
      byUser.set(p.userId, {
        userId: p.userId,
        name: p.workerName,
        email: p.workerEmail,
        weeksWorked: p.weeksWorked,
        phase: phaseFor(p.weeksWorked),
        lastWeek: p.weekLabel,
        lastWeekGrossCents: p.computed.breakdown.grossCents,
        lastWeekHours: Math.round(hours * 10) / 10,
      });
    }
  }
  const workers = [...byUser.values()].sort((a, b) => b.weeksWorked - a.weeksWorked);
  return { workers, signals: workers.flatMap(signalsFor).sort((a, b) => (a.level === b.level ? 0 : a.level === "warn" ? -1 : 1)) };
}

export interface ClientEconomics {
  tenantId: string;
  name: string;
  invoices: number;
  hours: number;
  revenueCents: number;
  wageCents: number;
  markupCents: number;
  markupRate: number;
}

/** Per client this month, from the UITZEND_FEE invoices (loonkosten + opslag lines). */
export async function clientEconomics(now = new Date()): Promise<ClientEconomics[]> {
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const invoices = await prisma.invoice.findMany({
    where: { type: "UITZEND_FEE", status: { in: ["ISSUED", "PAID"] }, createdAt: { gte: from } },
    select: { subtotalCents: true, recipientTenantId: true, recipientTenant: { select: { name: true } }, lines: { select: { description: true, quantity: true, amountCents: true } } },
    take: 20_000,
  });
  const by = new Map<string, ClientEconomics>();
  for (const inv of invoices) {
    if (!inv.recipientTenantId) continue;
    const c = by.get(inv.recipientTenantId) ?? { tenantId: inv.recipientTenantId, name: inv.recipientTenant?.name ?? "—", invoices: 0, hours: 0, revenueCents: 0, wageCents: 0, markupCents: 0, markupRate: 0 };
    c.invoices++;
    c.revenueCents += inv.subtotalCents;
    for (const l of inv.lines) {
      if (/^Loonkosten/i.test(l.description)) {
        c.wageCents += l.amountCents;
        c.hours += Number(l.quantity);
      } else c.markupCents += l.amountCents;
    }
    by.set(inv.recipientTenantId, c);
  }
  const rates = await Promise.all([...by.keys()].map(async (id) => [id, await markupFor(id)] as const));
  for (const [id, r] of rates) by.get(id)!.markupRate = r;
  return [...by.values()].map((c) => ({ ...c, hours: Math.round(c.hours * 10) / 10 })).sort((a, b) => b.revenueCents - a.revenueCents);
}

/** Markup rate for a client — its own agreed rate, or the default. */
export async function markupFor(tenantId: string): Promise<number> {
  const v = await kvGet<number>(`uitzend-markup:${tenantId}`);
  return typeof v === "number" && v >= 0 && v <= 2 ? v : env.UITZEND_MARKUP_RATE;
}

export async function setMarkup(tenantId: string, rate: number | null): Promise<number> {
  if (rate === null) {
    await kvSet(`uitzend-markup:${tenantId}`, null);
    return env.UITZEND_MARKUP_RATE;
  }
  if (!(rate >= 0.1 && rate <= 1.5)) throw new Error("Opslag tussen 10% en 150%");
  await kvSet(`uitzend-markup:${tenantId}`, rate);
  return rate;
}
