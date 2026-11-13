// ---------------------------------------------------------------------------
// Van een gekozen plek ("Waar woon je?") naar de postcode en woonplaats die het
// onboardingformulier en de server verwachten. Puur bestand: het formulier
// (components/app/ThuisbasisVelden.tsx) en de tests delen het, zonder prisma of
// netwerk. De postcode komt uit het adres dat de werker kiest, niet uit een
// veld dat hij zelf typt; een huisnummer leggen we niet vast.
// ---------------------------------------------------------------------------

/** Eén zoekresultaat zoals /api/geo/search het teruggeeft. */
export interface PlekResultaat {
  label: string;
  lat: number;
  lng: number;
  /** alleen bij een adres; PDOK schrijft hem zonder spatie ("1012JS") */
  postcode?: string | null | undefined;
  plaats?: string | null | undefined;
  /** adres, weg of woonplaats */
  soort?: string | null | undefined;
}

export interface ThuisbasisPlek {
  postalCode: string;
  city: string;
  /** Wat de werker terugziet: alleen postcode en woonplaats, geen straat of huisnummer. */
  label: string;
}

const NL_POSTCODE = /^(\d{4})\s*([A-Za-z]{2})$/;

/** "1012js" / "1012 JS" wordt "1012 JS"; geen Nederlandse postcode geeft null. */
export function nettePostcode(postcode: string | null | undefined): string | null {
  const m = NL_POSTCODE.exec((postcode ?? "").trim());
  return m ? `${m[1]} ${(m[2] ?? "").toUpperCase()}` : null;
}

/**
 * De thuisbasis die bij een gekozen plek hoort, of null als de plek geen
 * postcode heeft (een hele plaats of een straat zonder nummer): dan vraagt het
 * formulier om een straat en plaats.
 */
export function thuisbasisUitPlek(plek: Pick<PlekResultaat, "postcode" | "plaats">): ThuisbasisPlek | null {
  const postalCode = nettePostcode(plek.postcode);
  if (!postalCode) return null;
  const city = (plek.plaats ?? "").trim();
  return { postalCode, city, label: city ? `${postalCode} ${city}` : postalCode };
}

/** Ligt een coördinaat grofweg in Nederland? Buiten dit vak bellen we PDOK niet eens. */
export function inNederland(lat: number, lon: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= 50.7 && lat <= 53.7 && lon >= 3.2 && lon <= 7.3;
}

/** Leest één resultaat van /api/geo/search of /api/geo/reverse tot een nette plek (onbruikbaar geeft null). */
export function leesPlekResultaat(v: unknown): PlekResultaat | null {
  const r = v as Record<string, unknown> | null;
  if (!r || typeof r.label !== "string") return null;
  const lat = Number(r.lat);
  const lng = Number(r.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    label: r.label,
    lat,
    lng,
    postcode: typeof r.postcode === "string" ? r.postcode : null,
    plaats: typeof r.plaats === "string" ? r.plaats : null,
    soort: typeof r.soort === "string" ? r.soort : null,
  };
}

/**
 * De woonplaats bij een Nederlandse postcode, uit de adressen die /api/geo/search?soort=adres voor die postcode
 * geeft (PDOK). Alleen een adres met precies die postcode telt; geen of een onleesbaar antwoord geeft null.
 * Voor de thuisbasis (13 nov 2026): de werker typt alleen zijn postcode, de plaats zoeken wij erbij.
 */
export function plaatsBijPostcode(resultaten: readonly unknown[] | null | undefined, postcode: string | null | undefined): string | null {
  const net = nettePostcode(postcode);
  if (!net) return null;
  for (const r of resultaten ?? []) {
    const plek = leesPlekResultaat(r);
    const uit = plek ? thuisbasisUitPlek(plek) : null;
    if (uit && uit.postalCode === net && uit.city) return uit.city;
  }
  return null;
}
