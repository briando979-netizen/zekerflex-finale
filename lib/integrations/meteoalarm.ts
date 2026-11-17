// ---------------------------------------------------------------------------
// Weerwaarschuwingen van het KNMI, via de openbare Europese MeteoAlarm-feed (gratis, zonder sleutel): lezen en per plek en
// tijd de zwaarste waarschuwing vinden. Puur: geen fetch, geen database (die staan in meteoalarm-server.ts).
//   bron: https://feeds.meteoalarm.org/api/v1/warnings/feeds-netherlands → { warnings: [{ alert: { identifier, msgType,
//   info: [{ language, onset, expires, headline, area: [{ areaDesc, polygon: ["lat,lon lat,lon …"] }],
//   parameter: [{ valueName: "awareness_level", value: "3; orange; Severe" }, { valueName: "awareness_type", value: "1; Wind" }] }] } }] }
// De feed houdt ook verlopen waarschuwingen; die vallen hier weg. Een waarschuwing aan de kust (Vlissingen, IJmuiden) heeft
// een gebied op zee, dus een klus op het land valt er vanzelf buiten.
// ---------------------------------------------------------------------------

export type WeerSoort = "wind" | "sneeuw" | "onweer" | "mist" | "hitte" | "kou" | "kust" | "brand" | "regen" | "water";
export type WeerNiveau = "geel" | "oranje" | "rood";

export interface Weerwaarschuwing {
  id: string;
  soort: WeerSoort;
  niveau: WeerNiveau;
  /** ISO-tijdstip (met zone) */
  van: string;
  tot: string;
  /** gebied zoals het KNMI het noemt, bv. "Gelderland en delen van: Utrecht" */
  gebied: string;
  /** de kop van het KNMI, in het Nederlands als die er is */
  kop: string;
  /** veelhoeken van [breedte, lengte] */
  veelhoeken: [number, number][][];
}

/** awareness_type van MeteoAlarm → onze soort; 9 (lawines) en 11 komen in Nederland niet voor */
const SOORT: Record<string, WeerSoort> = {
  "1": "wind",
  "2": "sneeuw",
  "3": "onweer",
  "4": "mist",
  "5": "hitte",
  "6": "kou",
  "7": "kust",
  "8": "brand",
  "10": "regen",
  "12": "water",
  "13": "water",
};
const NIVEAU: Record<string, WeerNiveau> = { "2": "geel", "3": "oranje", "4": "rood" };
export const NIVEAU_RANG: Record<WeerNiveau, number> = { geel: 1, oranje: 2, rood: 3 };

const MAX_PUNTEN = 5000;

const tekst = (v: unknown) => (typeof v === "string" ? v.trim() : "");

function leesVeelhoek(v: unknown): [number, number][] | null {
  if (typeof v !== "string") return null;
  const punten: [number, number][] = [];
  for (const paar of v.trim().split(/\s+/).slice(0, MAX_PUNTEN)) {
    const [a, b] = paar.split(",");
    const lat = Number(a);
    const lon = Number(b);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    punten.push([lat, lon]);
  }
  return punten.length >= 3 ? punten : null;
}

function parameter(info: Record<string, unknown>, naam: string): string {
  const lijst = Array.isArray(info.parameter) ? info.parameter : [];
  for (const p of lijst) {
    if (p && typeof p === "object" && (p as Record<string, unknown>).valueName === naam) return tekst((p as Record<string, unknown>).value);
  }
  return "";
}

/** De geldende waarschuwingen (geel of zwaarder, nog niet verlopen, niet ingetrokken). Iets onleesbaars slaan we over. */
export function leesWaarschuwingen(json: unknown, nu: number): Weerwaarschuwing[] {
  const lijst = json && typeof json === "object" && Array.isArray((json as Record<string, unknown>).warnings) ? ((json as Record<string, unknown>).warnings as unknown[]) : [];
  const uit: Weerwaarschuwing[] = [];
  for (const w of lijst) {
    const alert = w && typeof w === "object" ? ((w as Record<string, unknown>).alert as Record<string, unknown> | undefined) : undefined;
    if (!alert || typeof alert !== "object") continue;
    if (tekst(alert.msgType).toLowerCase() === "cancel") continue;
    const infos = (Array.isArray(alert.info) ? alert.info : []).filter((i): i is Record<string, unknown> => !!i && typeof i === "object");
    const info = infos.find((i) => tekst(i.language).toLowerCase().startsWith("nl")) ?? infos[0];
    if (!info) continue;
    const niveau = NIVEAU[parameter(info, "awareness_level").split(";")[0]?.trim() ?? ""];
    const soort = SOORT[parameter(info, "awareness_type").split(";")[0]?.trim() ?? ""];
    const van = Date.parse(tekst(info.onset) || tekst(info.effective));
    const tot = Date.parse(tekst(info.expires));
    if (!niveau || !soort || !Number.isFinite(van) || !Number.isFinite(tot) || tot <= nu) continue;
    const gebieden = (Array.isArray(info.area) ? info.area : []).filter((a): a is Record<string, unknown> => !!a && typeof a === "object");
    const veelhoeken = gebieden.flatMap((a) => (Array.isArray(a.polygon) ? a.polygon : []).map(leesVeelhoek).filter((p): p is [number, number][] => !!p));
    if (veelhoeken.length === 0) continue;
    uit.push({
      id: tekst(alert.identifier).slice(0, 200) || `${soort}-${van}`,
      soort,
      niveau,
      van: new Date(van).toISOString(),
      tot: new Date(tot).toISOString(),
      gebied: gebieden.map((a) => tekst(a.areaDesc)).filter(Boolean).join(", ").slice(0, 200),
      kop: tekst(info.headline).replace(/\s+/g, " ").slice(0, 300),
      veelhoeken,
    });
  }
  return uit;
}

/** Ligt het punt binnen de veelhoek? (straal naar het oosten tellen; [breedte, lengte]) */
export function inVeelhoek(lat: number, lon: number, veelhoek: [number, number][]): boolean {
  let binnen = false;
  for (let i = 0, j = veelhoek.length - 1; i < veelhoek.length; j = i++) {
    const [yi, xi] = veelhoek[i] ?? [0, 0];
    const [yj, xj] = veelhoek[j] ?? [0, 0];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) binnen = !binnen;
  }
  return binnen;
}

/** De zwaarste waarschuwing die geldt op deze plek, ergens tussen `van` en `tot` (ms). Geen = null. */
export function waarschuwingVoor(lijst: Weerwaarschuwing[], plek: { lat: number; lon: number }, van: number, tot: number): Weerwaarschuwing | null {
  let beste: Weerwaarschuwing | null = null;
  for (const w of lijst) {
    if (Date.parse(w.van) >= tot || Date.parse(w.tot) <= van) continue;
    if (!w.veelhoeken.some((v) => inVeelhoek(plek.lat, plek.lon, v))) continue;
    if (!beste || NIVEAU_RANG[w.niveau] > NIVEAU_RANG[beste.niveau]) beste = w;
  }
  return beste;
}

/** Wat een scherm of melding nodig heeft (zonder de veelhoeken). */
export interface WeerMelding {
  soort: WeerSoort;
  niveau: WeerNiveau;
  van: string;
  tot: string;
  kop: string;
}

export const alsMelding = (w: Weerwaarschuwing): WeerMelding => ({ soort: w.soort, niveau: w.niveau, van: w.van, tot: w.tot, kop: w.kop });
