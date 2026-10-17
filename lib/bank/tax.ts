import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { createPot, movePot } from "@/lib/bank/pots";

// ---------------------------------------------------------------------------
// Tax help for zzp'ers. Reads the self-billing invoices ZekerFlex issued on
// the freelancer's behalf and shows per quarter: revenue excl. btw, the btw
// to remit to the Belastingdienst, and a suggested income-tax reservation
// (a percentage the freelancer chooses — a rule of thumb, not tax advice).
// One tap moves what's still missing into a "Belasting" pot.
//   key "bank-tax:<userId>" → { pct, potId }
// ---------------------------------------------------------------------------

export interface TaxSettings {
  pct: number;
  potId: string | null;
}
export interface Quarter {
  quarter: number;
  revenueCents: number;
  vatCents: number;
  incomeTaxCents: number;
  invoices: number;
}
export interface TaxOverview {
  year: number;
  pct: number;
  quarters: Quarter[];
  currentQuarter: number;
  toReserveCents: number;
  inPotCents: number;
  missingCents: number;
  potId: string | null;
}

const key = (userId: string) => `bank-tax:${userId}`;

export async function getTaxSettings(userId: string): Promise<TaxSettings> {
  return { pct: 30, potId: null, ...((await kvGet<Partial<TaxSettings>>(key(userId))) ?? {}) };
}

export async function setTaxPct(userId: string, pct: number): Promise<TaxSettings> {
  const s = { ...(await getTaxSettings(userId)), pct: Math.max(0, Math.min(60, Math.round(pct))) };
  await kvSet(key(userId), s);
  return s;
}

async function invoicesFor(userId: string, year: number) {
  const fp = await prisma.freelancerProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!fp) return [];
  return prisma.invoice.findMany({
    where: {
      issuerFreelancerId: fp.id,
      type: "SELF_BILL_FREELANCER",
      status: { in: ["ISSUED", "PAID"] },
      createdAt: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) },
    },
    select: { number: true, subtotalCents: true, vatCents: true, totalCents: true, status: true, createdAt: true, issuedAt: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function taxOverview(userId: string, accountId: string, year: number, now = new Date()): Promise<TaxOverview> {
  const settings = await getTaxSettings(userId);
  const quarters: Quarter[] = [1, 2, 3, 4].map((q) => ({ quarter: q, revenueCents: 0, vatCents: 0, incomeTaxCents: 0, invoices: 0 }));
  for (const inv of await invoicesFor(userId, year)) {
    const q = quarters[Math.floor((inv.issuedAt ?? inv.createdAt).getUTCMonth() / 3)]!;
    q.revenueCents += inv.subtotalCents;
    q.vatCents += inv.vatCents;
    q.invoices++;
  }
  for (const q of quarters) q.incomeTaxCents = Math.round((q.revenueCents * settings.pct) / 100);
  const currentQuarter = year === now.getUTCFullYear() ? Math.floor(now.getUTCMonth() / 3) + 1 : 4;
  // Reserve for the whole year so far: btw of quarters not yet filed is the
  // current one; income tax builds up over the year.
  const cur = quarters[currentQuarter - 1]!;
  const ibSoFar = quarters.slice(0, currentQuarter).reduce((s, q) => s + q.incomeTaxCents, 0);
  const toReserveCents = cur.vatCents + ibSoFar;
  const pot = settings.potId ? await prisma.bankPot.findFirst({ where: { id: settings.potId, accountId, closedAt: null } }) : null;
  const inPotCents = pot?.balanceCents ?? 0;
  return { year, pct: settings.pct, quarters, currentQuarter, toReserveCents, inPotCents, missingCents: Math.max(0, toReserveCents - inPotCents), potId: pot?.id ?? null };
}

/** Moves what's missing (capped at the balance) into the Belasting pot, creating it if needed. */
export async function reserveTax(userId: string, accountId: string, balanceCents: number): Promise<number> {
  const overview = await taxOverview(userId, accountId, new Date().getUTCFullYear());
  const amount = Math.min(overview.missingCents, balanceCents);
  if (amount <= 0) throw AppError.precondition(overview.missingCents === 0 ? "Je hebt al genoeg apart gezet" : "Onvoldoende saldo om apart te zetten");
  let potId = overview.potId;
  if (!potId) {
    potId = (await createPot({ accountId, name: "Belasting", emoji: "🧾", targetCents: overview.toReserveCents || null })).id;
    await kvSet(key(userId), { ...(await getTaxSettings(userId)), potId });
  }
  await movePot({ potId, accountId, direction: "in", amountCents: amount, requestKey: `tax-${Date.now()}` });
  return amount;
}

/** Year overview as CSV for the accountant. */
export async function taxCsv(userId: string, year: number): Promise<string> {
  const rows = await invoicesFor(userId, year);
  const e = (c: number) => (c / 100).toFixed(2).replace(".", ",");
  const lines = ["Factuur;Datum;Kwartaal;Omzet excl. btw;Btw;Totaal;Status"];
  for (const r of rows) {
    const d = r.issuedAt ?? r.createdAt;
    lines.push([r.number, d.toISOString().slice(0, 10), `Q${Math.floor(d.getUTCMonth() / 3) + 1}`, e(r.subtotalCents), e(r.vatCents), e(r.totalCents), r.status === "PAID" ? "betaald" : "open"].join(";"));
  }
  const sum = (f: (r: (typeof rows)[number]) => number) => e(rows.reduce((s, r) => s + f(r), 0));
  lines.push(["Totaal", "", "", sum((r) => r.subtotalCents), sum((r) => r.vatCents), sum((r) => r.totalCents), ""].join(";"));
  return `﻿${lines.join("\r\n")}\r\n`;
}
