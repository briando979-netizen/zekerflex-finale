// ---------------------------------------------------------------------------
// De poster met de QR-code uit het beheer van het SmileyApp-voorstel (deel 6a):
// A4 of A5, staand, met het logo, één korte zin en de QR-code. Puur, dus los te
// testen en ook bruikbaar in het beheer. De zin past het team zelf aan; de
// standaard is neutraal en belooft niets. De link in de QR-code komt uit
// lib/voorstel/smileyapp-qr.ts en verandert hier niet.
// ---------------------------------------------------------------------------

export const POSTER_ZIN_MAX = 80;
export const POSTER_ZIN_STANDAARD = "Vertel ons wat je ervan vindt";

export const POSTER_FORMATEN = ["a4", "a5"] as const;
export type PosterFormaat = (typeof POSTER_FORMATEN)[number];
export const POSTER_FORMAAT_NAAM: Record<PosterFormaat, string> = { a4: "A4", a5: "A5" };
export const isPosterFormaat = (f: unknown): f is PosterFormaat => typeof f === "string" && (POSTER_FORMATEN as readonly string[]).includes(f);

export type ZinUitkomst = { ok: true; waarde: string } | { ok: false; fout: string };

/** Eén regel platte tekst van hooguit tachtig tekens. Leeg is de standaardzin. */
export function leesPosterZin(ruw: unknown): ZinUitkomst {
  if (typeof ruw !== "string") return { ok: false, fout: "Typ een zin." };
  const zin = ruw
    .replace(/\p{Cc}+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (zin.length > POSTER_ZIN_MAX) return { ok: false, fout: `De zin is hooguit ${POSTER_ZIN_MAX} tekens (nu ${zin.length}).` };
  return { ok: true, waarde: zin || POSTER_ZIN_STANDAARD };
}

/** De zin uit de opslag; alles wat niet klopt wordt de standaard. */
export function posterZin(opgeslagen: unknown): string {
  const u = leesPosterZin(opgeslagen);
  return u.ok ? u.waarde : POSTER_ZIN_STANDAARD;
}
