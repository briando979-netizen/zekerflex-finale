// ---------------------------------------------------------------------------
// De gratis rij (lib/ai/ketting.ts): wanneer is een aanbieder weer bruikbaar?
//
// Puur (geen kv, geen fetch), zodat het te testen is en het beheerscherm het mag inlezen. Een aanbieder die zegt dat
// hij vol zit (429, of 402/413 "quota"), slaan we over tot zijn limiet weer opengaat; de volgende in de rij antwoordt.
// ---------------------------------------------------------------------------

/** Wat de rij per aanbieder onthoudt, in het geheugen van de app (globalThis) en kort in KV voor het beheerscherm. */
export interface AanbiederStand {
  /** tot wanneer overslaan (ms sinds 1970); 0 = bruikbaar */
  volTot: number;
  /** waarom overgeslagen, kort en in gewoon Nederlands (nooit de tekst van de vraag) */
  reden: string;
  /** de dag (UTC, "2026-11-16") waar de tellers bij horen */
  dag: string;
  /** vragen vandaag, en hoeveel daarvan gelukt */
  vandaag: number;
  gelukt: number;
  /** de laatste minuut: tijdstippen (ms) van de vragen, voor een limiet per minuut */
  minuut: number[];
  /** hoe lang het laatste goede antwoord duurde (ms); 0 = nog geen */
  laatsteMs: number;
}

export const nieuweStand = (dag: string): AanbiederStand => ({ volTot: 0, reden: "", dag, vandaag: 0, gelukt: 0, minuut: [], laatsteMs: 0 });

/** De dag in UTC: de meeste aanbieders zetten hun daglimiet om middernacht UTC terug. */
export const utcDag = (nu: number): string => new Date(nu).toISOString().slice(0, 10);

/** Middernacht UTC na `nu`, in ms. */
export function volgendeUtcMiddernacht(nu: number): number {
  const d = new Date(nu);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}

/**
 * Een duur zoals aanbieders hem in een kop zetten, naar ms: "30" (seconden, Retry-After), "2m59.56s", "1h2m", "6s",
 * "450ms". Null als het geen duur is.
 */
export function duurNaarMs(waarde: string | null | undefined): number | null {
  const t = (waarde ?? "").trim();
  if (!t) return null;
  if (/^\d+(\.\d+)?$/.test(t)) return Math.round(Number(t) * 1000);
  const re = /(\d+(?:\.\d+)?)(ms|h|m|s)/g;
  let totaal = 0;
  let gelezen = "";
  for (let m = re.exec(t); m; m = re.exec(t)) {
    const n = Number(m[1]);
    const eenheid = m[2];
    totaal += eenheid === "h" ? n * 3_600_000 : eenheid === "m" ? n * 60_000 : eenheid === "s" ? n * 1000 : n;
    gelezen += m[0];
  }
  return gelezen === t ? Math.round(totaal) : null;
}

/** Zo lang slaan we een aanbieder over als hij vol zegt te zijn zonder te zeggen hoe lang. */
export const STANDAARD_PAUZE_MS = 60_000;
/** Zo lang na een storing (5xx, geen verbinding, te traag): kort, want het is meestal snel over. */
export const STORING_PAUZE_MS = 2 * 60_000;
/** Zo lang na een fout die bij ons ligt of bij de instelling (sleutel geweigerd, model bestaat niet): een uur. */
export const INSTELLING_PAUZE_MS = 60 * 60_000;
/** Nooit langer dan dit overslaan op grond van een kop (een rare waarde mag de rij niet dagen dichtzetten). */
const MAX_PAUZE_MS = 26 * 3_600_000;

/** Een daglimiet in de melding van de aanbieder ("per day", "RPD", "TPD", "daily"; Cloudflare: code 3036, neurons). */
const DAGLIMIET = /per[ _-]?day|daily|\bRPD\b|\bTPD\b|requests per day|tokens per day|dagelijks|neurons|\b3036\b/i;

export type Uitkomst =
  | { soort: "vol"; tot: number; reden: string }
  | { soort: "storing"; tot: number; reden: string }
  | { soort: "instelling"; tot: number; reden: string }
  | { soort: "vraag"; reden: string };

/**
 * Wat een mislukt antwoord betekent voor de rij. `kop` leest een antwoordkop (Retry-After, x-ratelimit-reset-*),
 * `tekst` is het begin van de foutmelding van de aanbieder (alleen om een daglimiet te herkennen).
 *  - vraag: 413 (deze vraag is te groot voor dit model, bij Groq ook als "rate_limit_exceeded") en overige 4xx
 *    (bijv. 400): ligt aan deze vraag, niet aan de aanbieder → alleen voor deze vraag de volgende
 *  - vol: 429, of 402/400 met "quota"/"rate limit" → overslaan tot de limiet opengaat
 *  - instelling: 401/403 (sleutel of geen toegang), 404 (model of adres bestaat niet), 402 (tegoed) → een uur overslaan
 *  - storing: 5xx of 408 → kort overslaan
 */
export function uitkomstVan(status: number, kop: (naam: string) => string | null, tekst: string, nu: number): Uitkomst {
  if (status === 413) return { soort: "vraag", reden: "vraag te groot voor dit model" };
  const quota = /quota|rate.?limit|limit (reached|exceeded)|too many/i.test(tekst);
  if (status === 429 || ((status === 402 || status === 400) && quota)) {
    const wacht =
      retryAfterMs(kop("retry-after"), nu) ??
      maxDuur(kop("x-ratelimit-reset-requests"), kop("x-ratelimit-reset-tokens")) ??
      (DAGLIMIET.test(tekst) ? volgendeUtcMiddernacht(nu) - nu : null) ??
      STANDAARD_PAUZE_MS;
    const dag = DAGLIMIET.test(tekst);
    return { soort: "vol", tot: nu + Math.min(Math.max(wacht, 1000), MAX_PAUZE_MS), reden: dag ? "daglimiet bereikt" : "limiet bereikt" };
  }
  if (status === 401) return { soort: "instelling", tot: nu + INSTELLING_PAUZE_MS, reden: "sleutel geweigerd" };
  if (status === 403) return { soort: "instelling", tot: nu + INSTELLING_PAUZE_MS, reden: "geen toegang met deze sleutel" };
  if (status === 404) return { soort: "instelling", tot: nu + INSTELLING_PAUZE_MS, reden: "model of adres niet gevonden" };
  if (status === 402) return { soort: "instelling", tot: nu + INSTELLING_PAUZE_MS, reden: "tegoed op" };
  if (status >= 500 || status === 408) return { soort: "storing", tot: nu + STORING_PAUZE_MS, reden: `storing (${status})` };
  return { soort: "vraag", reden: `vraag geweigerd (${status})` };
}

/** Retry-After: seconden ("30"), een duur ("7m12s") of een datum ("Mon, 16 Nov 2026 10:00:20 GMT"). */
function retryAfterMs(waarde: string | null, nu: number): number | null {
  const duur = duurNaarMs(waarde);
  if (duur !== null) return duur;
  const datum = waarde ? Date.parse(waarde) : NaN;
  return Number.isFinite(datum) && datum > nu ? datum - nu : null;
}

function maxDuur(...waarden: (string | null)[]): number | null {
  const ms = waarden.map((w) => duurNaarMs(w)).filter((x): x is number => x !== null);
  return ms.length ? Math.max(...ms) : null;
}

/** De stand met tellers van vandaag (een nieuwe dag begint bij 0) en zonder vragen van langer dan een minuut geleden. */
export function bijgewerkt(stand: AanbiederStand | undefined, nu: number): AanbiederStand {
  const dag = utcDag(nu);
  const s = stand && stand.dag === dag ? stand : { ...nieuweStand(dag), volTot: stand?.volTot ?? 0, reden: stand?.reden ?? "", laatsteMs: stand?.laatsteMs ?? 0 };
  return { ...s, minuut: s.minuut.filter((t) => nu - t < 60_000) };
}

export interface EigenLimiet {
  /** vragen per minuut die we zelf hooguit sturen (iets onder de grens van de aanbieder); weglaten = geen */
  perMinuut?: number;
  /** vragen per dag die we zelf hooguit sturen; weglaten = geen */
  perDag?: number;
}

/** Mag er nu een vraag heen? Nee als hij vol zit, of als we zijn eigen grens per minuut of per dag al bereikt hebben. */
export function bruikbaar(stand: AanbiederStand | undefined, limiet: EigenLimiet, nu: number): boolean {
  const s = bijgewerkt(stand, nu);
  if (s.volTot > nu) return false;
  if (limiet.perMinuut !== undefined && s.minuut.length >= limiet.perMinuut) return false;
  if (limiet.perDag !== undefined && s.vandaag >= limiet.perDag) return false;
  return true;
}
