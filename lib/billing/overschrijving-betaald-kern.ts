// ---------------------------------------------------------------------------
// "Het geld staat op de rekening": een factuur die per bankoverschrijving is betaald op betaald zetten (14 nov 2026).
// De betaalpagina toont sinds 14 nov de rekening van ZekerFlex (lib/billing/overschrijving.ts), maar niemand kon een factuur
// daarna op betaald zetten: alleen Stripe deed dat.
// Bewust alleen voor de eigen facturen voor platformkosten. Bij andere soorten hangt er meer aan de betaling (een
// uitbetaling aan de werker, loon, een claim, de verlenging van een domein: markInvoicePaid in
// app/api/webhooks/stripe/route.ts) en dat mag niet met één klik met de hand afgaan.
// De beheerder vult ook het ontvangen bedrag in: alleen het hele factuurbedrag sluit de factuur (geen deelbetaling), en de
// bevestiging toont het bedrijf en het bedrag, zodat een typfout in het nummer niet de factuur van een ander sluit.
// Let op: deze knop boekt de betaling niet in het grootboek; dat gebeurt pas als het bankafschrift wordt verwerkt.
// Puur bestand: de regels. De handeling zelf staat in lib/billing/overschrijving-betaald.ts.
// ---------------------------------------------------------------------------

/** De soorten facturen die de beheerder met de hand op betaald mag zetten. */
export const HANDMATIG_BETAALBAAR: readonly string[] = ["PLATFORM_FEE"];

export type HandmatigUitslag = { ok: true } | { ok: false; reden: "al-betaald" | "niet-open" | "soort" | "bedrag" };

/** Mag deze factuur met de hand op betaald? Alleen een open factuur voor platformkosten met een bedrag. */
export function kanHandmatigBetaald(f: { type: string; status: string; totalCents: number }): HandmatigUitslag {
  if (f.status === "PAID") return { ok: false, reden: "al-betaald" };
  if (f.status !== "ISSUED") return { ok: false, reden: "niet-open" };
  if (!HANDMATIG_BETAALBAAR.includes(f.type)) return { ok: false, reden: "soort" };
  if (!(f.totalCents > 0)) return { ok: false, reden: "bedrag" };
  return { ok: true };
}

/** De melding bij een weigering, in gewone taal. */
export function handmatigMelding(reden: Exclude<HandmatigUitslag, { ok: true }>["reden"], nummer: string): string {
  if (reden === "al-betaald") return `Factuur ${nummer} staat al op betaald.`;
  if (reden === "niet-open") return `Factuur ${nummer} staat niet open (concept of geannuleerd) en kan dus niet op betaald.`;
  if (reden === "soort") return `Factuur ${nummer} kan niet met de hand op betaald: dat kan alleen bij een factuur voor platformkosten. Bij deze soort hangt er een uitbetaling of levering aan de betaling.`;
  return `Factuur ${nummer} heeft geen bedrag om te betalen.`;
}

/** "42,35", "42.35", "€ 1.234,50" of "42" → centen; null als het geen bedrag is. Wat de beheerder van het afschrift overtypt. */
export function bedragNaarCents(v: unknown): number | null {
  if (typeof v !== "string") return null;
  let s = v.replace(/[^\d.,]/g, "");
  if (!s || !/\d/.test(s)) return null;
  const dec = Math.max(s.lastIndexOf(","), s.lastIndexOf("."));
  // het laatste teken van de twee is het decimaalteken als er één of twee cijfers achter staan; anders zijn het duizendtallen
  if (dec >= 0 && s.length - dec - 1 >= 1 && s.length - dec - 1 <= 2) s = `${s.slice(0, dec).replace(/[.,]/g, "")}.${s.slice(dec + 1)}`;
  else s = s.replace(/[.,]/g, "");
  const n = Number(s);
  return Number.isFinite(n) && n > 0 && n < 10_000_000 ? Math.round(n * 100) : null;
}

/** Alleen precies het factuurbedrag sluit de factuur: geen deelbetaling en geen ander bedrag. */
export function bedragKlopt(ontvangenCents: number | null, totalCents: number): boolean {
  return ontvangenCents !== null && Number.isInteger(ontvangenCents) && ontvangenCents === totalCents;
}

const euro = (cents: number) => `€ ${(cents / 100).toFixed(2).replace(".", ",")}`;

/** De melding als het ingevulde bedrag niet het factuurbedrag is. */
export function bedragMelding(nummer: string, totalCents: number): string {
  return `Het bedrag klopt niet: factuur ${nummer} is ${euro(totalCents)}. Alleen het hele bedrag zet de factuur op betaald; bij een deel of een ander bedrag blijft hij open.`;
}
