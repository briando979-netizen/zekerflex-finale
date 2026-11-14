// ---------------------------------------------------------------------------
// "Het geld staat op de rekening": een factuur die per bankoverschrijving is betaald op betaald zetten (14 nov 2026).
// De betaalpagina toont sinds 14 nov de rekening van ZekerFlex (lib/billing/overschrijving.ts) en belooft dat de factuur
// daarna op betaald komt, maar niemand kon dat doen: alleen Stripe zette een factuur op betaald.
// Bewust alleen voor de eigen facturen voor platformkosten. Bij andere soorten hangt er meer aan de betaling (een
// uitbetaling aan de werker, loon, een claim, de verlenging van een domein: markInvoicePaid in
// app/api/webhooks/stripe/route.ts) en dat mag niet met één klik met de hand afgaan.
// Puur bestand: de regel. De handeling zelf staat in lib/billing/overschrijving-betaald.ts.
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
