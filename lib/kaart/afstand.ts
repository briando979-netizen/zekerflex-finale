import { TEGEL, tegelPositie } from "@/lib/kaart/voorbeeld";

// ---------------------------------------------------------------------------
// Hoe ver is een gedeelde locatie van jou, zoals in WhatsApp (15 nov 2026, eigenaar: "precies zien hoever de beide personen
// zijn"): de afstand in rechte lijn, en een kaartje met beide plekken (de speld van de ander, jij als blauwe stip, een
// stippellijn ertussen) op een zoom waarbij ze allebei passen. Puur, ook voor de browser; de tegels komen van
// /api/kaart/straat (alleen Nederland, lib/kaart/voorbeeld.ts).
// ---------------------------------------------------------------------------

export interface Punt {
  lat: number;
  lng: number;
}

const AARDE_M = 6_371_000;

/** Afstand in rechte lijn in meters (haversine). */
export function afstandMeter(a: Punt, b: Punt): number {
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * AARDE_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "40 m", "350 m", "1,2 km" (of "1.2 km" in het Engels), "12 km": afgerond zoals je het zegt. */
export function afstandTekst(meter: number, locale: string): string {
  if (meter < 50) return `${Math.max(0, Math.round(meter / 5) * 5)} m`;
  if (meter < 1000) return `${Math.round(meter / 10) * 10} m`;
  const km = meter / 1000;
  const getal = new Intl.NumberFormat(locale, { maximumFractionDigits: km < 10 ? 1 : 0, minimumFractionDigits: 0 }).format(km < 10 ? Math.round(km * 10) / 10 : Math.round(km));
  return `${getal} km`;
}

export const MIN_ZOOM = 10;
export const MAX_ZOOM = 16;

/** De grootste zoom (10 t/m 16) waarbij beide punten met een rand in een kaartje van breedte×hoogte passen; null = te ver uit elkaar. */
export function zoomVoorTwee(a: Punt, b: Punt, breedte: number, hoogte: number, rand = 28): number | null {
  for (let z = MAX_ZOOM; z >= MIN_ZOOM; z--) {
    const pa = tegelPositie(a.lat, a.lng, z);
    const pb = tegelPositie(b.lat, b.lng, z);
    if (Math.abs(pa.x - pb.x) * TEGEL <= breedte - 2 * rand && Math.abs(pa.y - pb.y) * TEGEL <= hoogte - 2 * rand) return z;
  }
  return null;
}

export interface Gebied {
  zoom: number;
  /** de tegels, met hun linkerbovenhoek ten opzichte van het midden van het kaartje (in beeldpunten) */
  tegels: { x: number; y: number; links: number; boven: number }[];
  /** waar de twee punten staan, ten opzichte van het midden van het kaartje */
  a: { x: number; y: number };
  b: { x: number; y: number };
}

/** De tegels en de plek van beide punten voor een kaartje van breedte×hoogte, met het midden tussen de punten in het midden. */
export function gebiedVoorTwee(a: Punt, b: Punt, breedte: number, hoogte: number): Gebied | null {
  const zoom = zoomVoorTwee(a, b, breedte, hoogte);
  if (zoom === null) return null;
  const pa = tegelPositie(a.lat, a.lng, zoom);
  const pb = tegelPositie(b.lat, b.lng, zoom);
  const mx = ((pa.x + pb.x) / 2) * TEGEL;
  const my = ((pa.y + pb.y) / 2) * TEGEL;
  const n = 2 ** zoom;
  const tegels: Gebied["tegels"] = [];
  for (let ty = Math.floor((my - hoogte / 2) / TEGEL); ty <= Math.floor((my + hoogte / 2) / TEGEL); ty++) {
    for (let tx = Math.floor((mx - breedte / 2) / TEGEL); tx <= Math.floor((mx + breedte / 2) / TEGEL); tx++) {
      if (tx < 0 || ty < 0 || tx >= n || ty >= n) continue;
      tegels.push({ x: tx, y: ty, links: Math.round(tx * TEGEL - mx), boven: Math.round(ty * TEGEL - my) });
    }
  }
  return {
    zoom,
    tegels,
    a: { x: Math.round(pa.x * TEGEL - mx), y: Math.round(pa.y * TEGEL - my) },
    b: { x: Math.round(pb.x * TEGEL - mx), y: Math.round(pb.y * TEGEL - my) },
  };
}
