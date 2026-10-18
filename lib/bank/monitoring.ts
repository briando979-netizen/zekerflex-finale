import { prisma } from "@/lib/prisma";
import { kvGet, kvSet } from "@/lib/storage/kv";

// ---------------------------------------------------------------------------
// Transaction monitoring for /admin/bank. Scans the last 7 days of bookings
// for the patterns banks watch for and lists them for a human to review
// (and, if needed, freeze the account from the same screen). Signals, not
// verdicts: an alert is marked reviewed with a note, never acted on alone.
//   key "bank-aml-reviewed:<alertId>" → { by, note, at }
// ---------------------------------------------------------------------------

export interface AmlAlert {
  id: string;
  accountId: string;
  holderName: string;
  rule: "large" | "passthrough" | "fan_in" | "burst" | "new_account_volume";
  title: string;
  detail: string;
  amountCents: number;
  at: string;
  reviewed?: { by: string; note: string; at: string };
}

export const LARGE_CENTS = 500_000; // € 5.000
const DAY = 86_400_000;
const MONEY_IN = new Set(["TOPUP", "TRANSFER", "EARNING", "BONUS"]);
const MONEY_OUT = new Set(["TRANSFER", "WITHDRAWAL", "CARD_SPEND"]);

export async function scanAlerts(now = new Date()): Promise<AmlAlert[]> {
  const since = new Date(now.getTime() - 7 * DAY);
  const entries = await prisma.bankEntry.findMany({
    where: { createdAt: { gte: since }, account: { ownerType: { not: "PLATFORM" } } },
    select: { id: true, accountId: true, amountCents: true, kind: true, counterparty: true, createdAt: true, account: { select: { holderName: true, createdAt: true } } },
    orderBy: { createdAt: "asc" },
    take: 50_000,
  });
  const alerts: AmlAlert[] = [];
  const byAccount = new Map<string, typeof entries>();
  for (const e of entries) {
    if (!byAccount.has(e.accountId)) byAccount.set(e.accountId, []);
    byAccount.get(e.accountId)!.push(e);
    if (Math.abs(e.amountCents) >= LARGE_CENTS && (MONEY_IN.has(e.kind) || MONEY_OUT.has(e.kind))) {
      alerts.push({
        id: `large:${e.id}`,
        accountId: e.accountId,
        holderName: e.account.holderName,
        rule: "large",
        title: "Groot bedrag",
        detail: `${e.amountCents > 0 ? "Binnen" : "Uit"} via ${e.kind}${e.counterparty ? ` (${e.counterparty})` : ""}`,
        amountCents: e.amountCents,
        at: e.createdAt.toISOString(),
      });
    }
  }

  for (const [accountId, list] of byAccount) {
    const holderName = list[0]!.account.holderName;
    const created = list[0]!.account.createdAt;
    // Pass-through: ≥ € 1.000 in, ≥ 80% of it out again within 24 hours.
    for (const inn of list.filter((e) => e.amountCents >= 100_000 && MONEY_IN.has(e.kind))) {
      const t = inn.createdAt.getTime();
      const out = list.filter((e) => e.amountCents < 0 && MONEY_OUT.has(e.kind) && e.createdAt.getTime() >= t && e.createdAt.getTime() <= t + DAY).reduce((s, e) => s - e.amountCents, 0);
      if (out >= inn.amountCents * 0.8) {
        alerts.push({ id: `pass:${inn.id}`, accountId, holderName, rule: "passthrough", title: "Doorsluizen", detail: `${(inn.amountCents / 100).toFixed(0)} EUR binnen, ${(out / 100).toFixed(0)} EUR binnen 24 uur weer weg`, amountCents: inn.amountCents, at: inn.createdAt.toISOString() });
        break;
      }
    }
    // Fan-in: 10+ different senders in 24 hours (money-mule pattern).
    const last24 = list.filter((e) => e.createdAt.getTime() >= now.getTime() - DAY);
    const senders = new Set(last24.filter((e) => e.amountCents > 0 && e.kind === "TRANSFER" && e.counterparty).map((e) => e.counterparty));
    if (senders.size >= 10) {
      alerts.push({ id: `fanin:${accountId}:${now.toISOString().slice(0, 10)}`, accountId, holderName, rule: "fan_in", title: "Veel verschillende afzenders", detail: `${senders.size} afzenders in 24 uur`, amountCents: last24.filter((e) => e.amountCents > 0).reduce((s, e) => s + e.amountCents, 0), at: now.toISOString() });
    }
    // Burst: 20+ outgoing transfers in 24 hours.
    const outgoing = last24.filter((e) => e.amountCents < 0 && e.kind === "TRANSFER");
    if (outgoing.length >= 20) {
      alerts.push({ id: `burst:${accountId}:${now.toISOString().slice(0, 10)}`, accountId, holderName, rule: "burst", title: "Veel overboekingen", detail: `${outgoing.length} overboekingen in 24 uur`, amountCents: outgoing.reduce((s, e) => s + e.amountCents, 0), at: now.toISOString() });
    }
    // New account (< 7 days) already moving ≥ € 2.500.
    if (now.getTime() - created.getTime() < 7 * DAY) {
      const volume = list.reduce((s, e) => s + Math.abs(e.amountCents), 0);
      if (volume >= 250_000) {
        alerts.push({ id: `new:${accountId}`, accountId, holderName, rule: "new_account_volume", title: "Nieuwe rekening, veel volume", detail: `${(volume / 100).toFixed(0)} EUR bewogen sinds opening ${created.toLocaleDateString("nl-NL")}`, amountCents: volume, at: list.at(-1)!.createdAt.toISOString() });
      }
    }
  }

  const withReview = await Promise.all(
    alerts.map(async (a) => {
      const reviewed = await kvGet<AmlAlert["reviewed"]>(`bank-aml-reviewed:${a.id}`);
      return reviewed ? { ...a, reviewed } : a;
    }),
  );
  return withReview.sort((a, b) => (!!a.reviewed === !!b.reviewed ? (a.at < b.at ? 1 : -1) : a.reviewed ? 1 : -1));
}

export async function reviewAlert(id: string, by: string, note: string): Promise<void> {
  await kvSet(`bank-aml-reviewed:${id}`, { by, note: note.slice(0, 300), at: new Date().toISOString() });
}
