// Pure hulpjes voor de uurbakjes van het foutenlogboek (lib/ops/error-journal.ts).
// Geen prisma/kv/node: zowel de server (journal + merge) als het scherm
// (components/admin/ErrorJournalPanel.tsx) importeren hieruit, zodat "× in de
// laatste 24 uur" op één manier wordt gerekend. Een uurbakje is één UTC-uur,
// bv. "2026-11-19T00" = het uur 00:00–00:59 UTC.

/** Zoveel uur bewaren we de bakjes (ruim genoeg voor een 24-uursvenster). */
export const UREN_BEWAREN = 48;

/** De uur-sleutel (UTC) waarin dit tijdstip valt, bv. "2026-11-19T00". */
export function uurSleutel(at: Date): string {
  return at.toISOString().slice(0, 13);
}

/** Begin (ms) van het uur dat bij een sleutel hoort; NaN voor een onzinnige sleutel. */
const msVanSleutel = (k: string): number => Date.parse(`${k}:00:00Z`);

/** Twee verzamelingen bakjes optellen per uur. */
export function samenvoegUren(a: Record<string, number> = {}, b: Record<string, number> = {}): Record<string, number> {
  const out: Record<string, number> = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = (out[k] ?? 0) + v;
  return out;
}

/** Houd alleen de bakjes van de laatste UREN_BEWAREN uur (t.o.v. now). */
export function snoeiUren(uren: Record<string, number> = {}, now = Date.now()): Record<string, number> {
  const grens = now - UREN_BEWAREN * 3_600_000;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(uren)) {
    const t = msVanSleutel(k);
    if (Number.isFinite(t) && t >= grens && v > 0) out[k] = v;
  }
  return out;
}

/** Hoe vaak in de laatste 24 uur (uit de uurbakjes). Een groep zonder bakjes (van vóór dit veld) geeft 0. */
export function aantalLaatste24u(uren: Record<string, number> | undefined, now = Date.now()): number {
  if (!uren) return 0;
  const grens = now - 24 * 3_600_000;
  let n = 0;
  for (const [k, v] of Object.entries(uren)) {
    const t = msVanSleutel(k);
    if (Number.isFinite(t) && t >= grens) n += v;
  }
  return n;
}
