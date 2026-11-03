// ---------------------------------------------------------------------------
// Rekenwerk voor ZekerFlex Kaart, puur (geen browser, geen database), zodat het
// te testen is: afstanden over het aardoppervlak, een opgenomen rit, opmaak in
// gewoon Nederlands, GPX om een rit mee te nemen, en de antwoorden van PDOK.
// ---------------------------------------------------------------------------

export type Punt = [lon: number, lat: number];

export interface RitPunt {
  lon: number;
  lat: number;
  /** ms sinds 1970 */
  t: number;
  /** nauwkeurigheid in meters, zoals de telefoon die geeft */
  nauwkeurigheid?: number;
}

const AARDE_M = 6_371_008.8;
const rad = (g: number) => (g * Math.PI) / 180;

/** Afstand in meters tussen twee punten (haversine). */
export function afstand(a: Punt, b: Punt): number {
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * AARDE_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function lijnLengte(punten: Punt[]): number {
  let m = 0;
  for (let i = 1; i < punten.length; i++) m += afstand(punten[i - 1]!, punten[i]!);
  return m;
}

/**
 * Een nieuw GPS-punt alleen bewaren als het iets toevoegt: nauwkeurig genoeg
 * (≤ 50 m) en minstens een paar meter van het vorige, zodat stilstaan en
 * GPS-ruis de rit niet langer maken.
 */
export function bewaarPunt(rit: RitPunt[], p: RitPunt, minMeters = 4, maxOnnauwkeurig = 50): boolean {
  if (p.nauwkeurigheid !== undefined && p.nauwkeurigheid > maxOnnauwkeurig) return false;
  const vorige = rit[rit.length - 1];
  if (!vorige) return true;
  if (p.t <= vorige.t) return false;
  return afstand([vorige.lon, vorige.lat], [p.lon, p.lat]) >= minMeters;
}

export interface RitStand {
  meters: number;
  seconden: number;
  /** gemiddeld, km/u */
  gemiddeld: number;
  /** over de laatste ~10 seconden, km/u */
  nu: number;
}

export function ritStand(rit: RitPunt[]): RitStand {
  const meters = lijnLengte(rit.map((p) => [p.lon, p.lat]));
  const eerste = rit[0];
  const laatste = rit[rit.length - 1];
  const seconden = eerste && laatste ? Math.max(0, (laatste.t - eerste.t) / 1000) : 0;
  let nu = 0;
  if (laatste) {
    const venster = rit.filter((p) => laatste.t - p.t <= 10_000);
    const v0 = venster[0];
    if (v0 && venster.length > 1) {
      const s = (laatste.t - v0.t) / 1000;
      if (s > 0) nu = (lijnLengte(venster.map((p) => [p.lon, p.lat])) / s) * 3.6;
    }
  }
  return { meters, seconden, gemiddeld: seconden > 0 ? (meters / seconden) * 3.6 : 0, nu };
}

/** "850 m", "12,4 km" */
export function afstandTekst(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toLocaleString("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: meters < 100_000 ? 1 : 0 })} km`;
}

/** "45 s", "12 min", "1 u 05 min" */
export function duurTekst(seconden: number): string {
  const s = Math.round(seconden);
  if (s < 60) return `${s} s`;
  const min = Math.floor(s / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} u ${String(min % 60).padStart(2, "0")} min`;
}

const xml = (s: string) => s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c] ?? c);

/** Een opgenomen rit als GPX 1.1, te openen in elke routeplanner of sportapp. */
export function gpx(rit: RitPunt[], naam: string): string {
  const punten = rit
    .map((p) => `      <trkpt lat="${p.lat.toFixed(7)}" lon="${p.lon.toFixed(7)}"><time>${new Date(p.t).toISOString()}</time></trkpt>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="ZekerFlex Kaart" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${xml(naam)}</name>
    <trkseg>
${punten}
    </trkseg>
  </trk>
</gpx>
`;
}

export interface ZoekResultaat {
  naam: string;
  soort: string;
  lon: number;
  lat: number;
}

const SOORT: Record<string, string> = { adres: "Adres", weg: "Straat", woonplaats: "Plaats", postcode: "Postcode", gemeente: "Gemeente" };

/** Het antwoord van de PDOK Locatieserver (free) → nette resultaten. Onbruikbare regels vallen weg. */
export function leesPdokResultaten(data: unknown): ZoekResultaat[] {
  const docs = (data as { response?: { docs?: unknown[] } })?.response?.docs;
  if (!Array.isArray(docs)) return [];
  const uit: ZoekResultaat[] = [];
  for (const d of docs) {
    const r = d as { weergavenaam?: unknown; type?: unknown; centroide_ll?: unknown };
    const m = typeof r.centroide_ll === "string" ? /^POINT\(([-\d.]+) ([-\d.]+)\)$/.exec(r.centroide_ll) : null;
    if (!m || typeof r.weergavenaam !== "string") continue;
    const lon = Number(m[1]);
    const lat = Number(m[2]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    uit.push({ naam: r.weergavenaam, soort: SOORT[String(r.type)] ?? "Plaats", lon, lat });
  }
  return uit;
}
