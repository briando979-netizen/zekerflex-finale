import { kvGet, kvSet } from "@/lib/storage/kv";

// ---------------------------------------------------------------------------
// Uitgaven per kaart bijhouden voor dag- en weekbudget. Durable KV-tellers;
// opgehoogd zodra een autorisatie wordt goedgekeurd.
// ---------------------------------------------------------------------------

const dayStr = (d = new Date()) => d.toISOString().slice(0, 10);

function weekStr(d = new Date()): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (t.getUTCDay() + 6) % 7; // ma=0
  t.setUTCDate(t.getUTCDate() - dayNum + 3); // donderdag van deze week
  const firstThursday = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round((t.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

const dayKey = (cardId: string, d?: Date) => `issuing:spend:${cardId}:day:${dayStr(d)}`;
const weekKey = (cardId: string, d?: Date) => `issuing:spend:${cardId}:week:${weekStr(d)}`;

export async function spentToday(cardId: string): Promise<number> {
  return (await kvGet<number>(dayKey(cardId)).catch(() => null)) ?? 0;
}
export async function spentThisWeek(cardId: string): Promise<number> {
  return (await kvGet<number>(weekKey(cardId)).catch(() => null)) ?? 0;
}
export async function addSpend(cardId: string, cents: number): Promise<void> {
  const [d, w] = await Promise.all([spentToday(cardId), spentThisWeek(cardId)]);
  await Promise.all([kvSet(dayKey(cardId), d + cents), kvSet(weekKey(cardId), w + cents)]);
}
