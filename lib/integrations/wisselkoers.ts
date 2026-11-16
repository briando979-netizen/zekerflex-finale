// ---------------------------------------------------------------------------
// Wisselkoersen van de Europese Centrale Bank (16 nov 2026, eigenaar: "go" op de gratis API's): de officiële dagkoersen
// (eurofxref-daily.xml, openbaar en gratis, zonder sleutel). Gebruikt om een inkoopprijs van een leverancier buiten de
// eurozone (Alibaba: dollars of yuan) om te rekenen. De ECB publiceert op werkdagen rond 16:00; in het weekend geldt de
// koers van vrijdag. Puur bestand: lezen en rekenen. De server staat in wisselkoers-server.ts.
// ---------------------------------------------------------------------------

export interface Koersen {
  /** de dag van de koersen ("2026-11-13") */
  datum: string;
  /** per munt: hoeveel van die munt één euro waard is (USD 1.1052 = 1 euro is 1,1052 dollar) */
  koersen: Record<string, number>;
}

/** De dagkoersen uit het XML-bestand van de ECB; null als er niets bruikbaars in staat. */
export function leesEcbKoersen(xml: string): Koersen | null {
  const datum = /time=['"](\d{4}-\d{2}-\d{2})['"]/.exec(xml)?.[1];
  if (!datum) return null;
  const koersen: Record<string, number> = {};
  for (const m of xml.matchAll(/currency=['"]([A-Z]{3})['"]\s+rate=['"]([\d.]+)['"]/g)) {
    const koers = Number(m[2]);
    if (m[1] && Number.isFinite(koers) && koers > 0) koersen[m[1]] = koers;
  }
  return Object.keys(koersen).length ? { datum, koersen } : null;
}

/** Een bedrag in centen van een andere munt naar eurocenten; null als de munt onbekend is. EUR blijft gelijk. */
export function naarEuroCents(cents: number, munt: string, k: Koersen | null): number | null {
  const m = munt.toUpperCase();
  if (m === "EUR") return Math.round(cents);
  const koers = k && Object.hasOwn(k.koersen, m) ? k.koersen[m] : undefined;
  return koers ? Math.round(cents / koers) : null;
}

const MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];

/** "2026-11-13" → "13 november 2026" (vast, zonder toLocale: server en browser gelijk). */
export function koersDatumTekst(datum: string): string {
  const [j, m, d] = datum.split("-").map(Number);
  return j && m && d ? `${d} ${MAANDEN[m - 1] ?? ""} ${j}` : datum;
}
