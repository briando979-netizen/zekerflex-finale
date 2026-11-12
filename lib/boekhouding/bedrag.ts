// ---------------------------------------------------------------------------
// Boekhouding: bedragen en btw-afronding (puur). Alles in gehele centen; nooit Float of Decimal in de opslag.
// Afronding: half-up op hele centen, bij een negatief bedrag spiegelbeeldig (half weg van nul), zodat een
// creditnota precies het tegengestelde van de factuur geeft. De afronding is bij BTW-aangifte per regel/factuur:
// door accountant te bevestigen of dit voor de aangifte per factuur of per regel moet.
// ---------------------------------------------------------------------------

/** Een regel mag hooguit 2.000.000.000 cent zijn (20 miljoen euro): ruim binnen Int (2.147.483.647) in de database. */
export const MAX_REGEL_CENTS = 2_000_000_000;

export function isGeheleCenten(n: unknown): n is number {
  return typeof n === "number" && Number.isSafeInteger(n);
}

/** "EUR 1.210,00" - voor foutteksten en schermen; alleen uit gehele centen. */
export function formatCenten(cents: number, valuta = "EUR"): string {
  const negatief = cents < 0;
  const abs = Math.abs(cents);
  const euro = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const rest = String(abs % 100).padStart(2, "0");
  return `${negatief ? "-" : ""}${valuta} ${euro},${rest}`;
}

function controleerBasispunten(basispunten: number): void {
  if (!Number.isInteger(basispunten) || basispunten < 0 || basispunten > 10000) {
    throw new RangeError("Een btw-tarief is een geheel aantal basispunten tussen 0 en 10000 (2100 = 21%).");
  }
}

/** Half-up deling voor niet-negatieve BigInts: floor(teller / noemer + 1/2). */
function halfUpDelen(teller: bigint, noemer: bigint): bigint {
  return (2n * teller + noemer) / (2n * noemer);
}

/**
 * Btw over een bedrag exclusief btw: grondslag x tarief, afgerond half-up op centen.
 * 10000 cent bij 2100 basispunten = 2100 cent. Een negatieve grondslag (creditnota) geeft een negatieve btw.
 */
export function btwBedrag(grondslagCents: number, tariefBasispunten: number): number {
  if (!isGeheleCenten(grondslagCents)) throw new RangeError("Een bedrag is een geheel aantal centen.");
  controleerBasispunten(tariefBasispunten);
  const abs = BigInt(Math.abs(grondslagCents));
  const btw = Number(halfUpDelen(abs * BigInt(tariefBasispunten), 10000n));
  return grondslagCents < 0 ? -btw : btw;
}

/**
 * Splitst een bedrag inclusief btw in grondslag en btw: btw = bruto x tarief / (10000 + tarief), half-up op centen;
 * de grondslag is wat overblijft, zodat grondslag + btw altijd precies het brutobedrag is.
 */
export function splitsBruto(
  brutoCents: number,
  tariefBasispunten: number,
): { grondslagCents: number; btwCents: number } {
  if (!isGeheleCenten(brutoCents)) throw new RangeError("Een bedrag is een geheel aantal centen.");
  controleerBasispunten(tariefBasispunten);
  const abs = BigInt(Math.abs(brutoCents));
  const btwAbs = Number(halfUpDelen(abs * BigInt(tariefBasispunten), 10000n + BigInt(tariefBasispunten)));
  const btwCents = brutoCents < 0 ? -btwAbs : btwAbs;
  return { grondslagCents: brutoCents - btwCents, btwCents };
}
