import { kvGet, kvSet } from "@/lib/storage/kv";

// ---------------------------------------------------------------------------
// Periode-telbare omzet-gebeurtenissen (fees die niet als factuur geboekt
// worden, zoals snelle-uitbetaling-/voorschot-fees). Opgeteld in maandbuckets
// in de KeyValueStore, zodat het Financiën-overzicht ze per periode kan tonen.
// Indicatief (zoals de rest van dat overzicht); vanaf nu meegeteld.
// ---------------------------------------------------------------------------

const monthKey = (type: string, d: Date) =>
  `revenue:${type}:${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

export async function recordRevenueEvent(type: string, cents: number, at = new Date()): Promise<void> {
  if (!cents || cents <= 0) return;
  const key = monthKey(type, at);
  const current = (await kvGet<number>(key).catch(() => null)) ?? 0;
  await kvSet(key, current + Math.round(cents));
}

export async function sumRevenueEvents(type: string, from: Date, to: Date): Promise<number> {
  let total = 0;
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));
  // harde bovengrens tegen een doorlopende lus
  for (let i = 0; d <= end && i < 240; i++) {
    total += (await kvGet<number>(monthKey(type, d)).catch(() => null)) ?? 0;
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return total;
}
