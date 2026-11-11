// ---------------------------------------------------------------------------
// De live reeks van de tweede selfie: zag de server het hoofd echt draaien, met tussenstanden? Puur bestand.
//
// Waarom: de bewegingscontrole (beweging.ts) vergelijkt twee foto's. Twee echte foto's van dezelfde persoon,
// één recht en één gedraaid (bijvoorbeeld van sociale media), komen daar doorheen. Bij een echte draai voor de
// camera ziet de server tijdens het live meten (POST /api/onboarding/gezicht-live) tussenstanden voorbijkomen,
// bijvoorbeeld 0,03 → 0,12 → 0,21 → 0,31. Twee losse foto's voor de camera springen in één keer van recht naar
// gedraaid. Dat verhoogt de drempel (dan is een video nodig); het is geen certificaat.
//
// Voorlopig ALLEEN METEN (afgesproken met 73, 11 nov 2026): de samenvatting staat bij de controle in
// rawPayload.gezicht.reeks en in de beoordeling. Een poort komt er pas na ±20 echte gevallen, en wordt dan
// hoogstens "een mens kijkt mee", nooit afwijzen. Wie snel draait of bij wie het live meten uitvalt (de
// aftelknop), heeft ook geen tussenstanden.
// ---------------------------------------------------------------------------

import { BEWEGING, LIVE, type LiveMeting } from "@/lib/kyc/gezicht/beweging";

/** Alleen getallen: `b` het begin (ms sinds 1970), per meting [ms sinds b, draaiing, oog, score]. */
export interface LiveReeks {
  b: number;
  r: [number, number, number, number][];
}

export const REEKS = {
  /** hoogstens zoveel metingen bewaren (bij ±2 per seconde ruim een halve minuut) */
  max: 60,
  /** een reeks waarin zo lang niets gebeurde, begint opnieuw (en de opruimtaak wist hem) */
  geldigMs: 2 * 60 * 60_000,
  /** alleen de metingen van het laatste half uur tellen mee in de samenvatting */
  vensterMs: 30 * 60_000,
  /** een tussenstand ligt tussen 25% en 75% van de draai, van de laatste rechte stand naar de eindstand */
  tussenVan: 0.25,
  tussenTot: 0.75,
} as const;

export interface ReeksSamenvatting {
  /** hoeveel metingen er in het venster waren */
  beelden: number;
  /** hoeveel daarvan tussen de rechte stand en de eindstand lagen (zie REEKS.tussenVan/tussenTot) */
  tussenstanden: number;
  /** hoe lang de draai duurde, van de laatste rechte stand tot de eindstand; null als er geen draai te zien was */
  ms: number | null;
  /** de draai zelf (eindstand min rechte stand, afgerond); null als er geen rechte stand voor de eindstand was */
  draai: number | null;
}

const rond = (v: number, n: number): number => Math.round(v * 10 ** n) / 10 ** n;

/** Voegt één meting toe. Een oude of lege reeks begint opnieuw; daarna blijven de laatste REEKS.max over. */
export function voegToe(reeks: LiveReeks | null, m: LiveMeting, nu: number): LiveReeks {
  const laatste = reeks?.r[reeks.r.length - 1];
  const basis: LiveReeks = reeks && laatste && nu >= reeks.b && nu - (reeks.b + laatste[0]) <= REEKS.geldigMs ? reeks : { b: nu, r: [] };
  const r = [...basis.r, [nu - basis.b, rond(m.draaiing, 3), rond(m.oog, 3), rond(m.score, 2)] as [number, number, number, number]];
  return { b: basis.b, r: r.slice(-REEKS.max) };
}

/** Leest een bewaarde waarde soepel: alles wat niet klopt, telt als geen reeks. */
export function leesReeks(v: unknown): LiveReeks | null {
  if (!v || typeof v !== "object") return null;
  const o = v as { b?: unknown; r?: unknown };
  if (typeof o.b !== "number" || !Array.isArray(o.r)) return null;
  const r = o.r.filter((x): x is [number, number, number, number] => Array.isArray(x) && x.length === 4 && x.every((n) => typeof n === "number" && Number.isFinite(n)));
  return { b: o.b, r };
}

/** De samenvatting voor de controle: hoeveel beelden, hoeveel tussenstanden, hoe lang de draai duurde. */
export function vatReeksSamen(reeks: LiveReeks | null, nu: number): ReeksSamenvatting {
  const metingen = (reeks?.r ?? []).map(([dt, d]) => ({ t: (reeks?.b ?? 0) + dt, d })).filter((x) => x.t >= nu - REEKS.vensterMs && x.t <= nu);
  const leeg: ReeksSamenvatting = { beelden: metingen.length, tussenstanden: 0, ms: null, draai: null };
  const eind = metingen[metingen.length - 1];
  if (!eind || metingen.length < 2) return leeg;
  // de laatste rechte stand vóór de eindstand: liefst zo recht als het scherm vraagt (LIVE), anders zo recht als de server toelaat
  const laatsteRecht = (max: number): number => {
    for (let i = metingen.length - 2; i >= 0; i--) if (Math.abs(metingen[i]?.d ?? Infinity) <= max) return i;
    return -1;
  };
  const strak = laatsteRecht(LIVE.rechtMax);
  const start = strak >= 0 ? strak : laatsteRecht(BEWEGING.rechtMax);
  const s = metingen[start];
  if (!s) return leeg;
  const draai = eind.d - s.d;
  if (Math.abs(draai) < BEWEGING.minVerschil) return { ...leeg, draai: rond(draai, 3) };
  const tussenstanden = metingen.slice(start + 1, -1).filter((x) => {
    const deel = (x.d - s.d) / draai;
    return deel >= REEKS.tussenVan && deel <= REEKS.tussenTot;
  }).length;
  return { beelden: metingen.length, tussenstanden, ms: eind.t - s.t, draai: rond(draai, 3) };
}
