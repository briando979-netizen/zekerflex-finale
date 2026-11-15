import { tegelPositie, TEGEL } from "@/lib/kaart/voorbeeld";
import { leverFase, type LeverFase } from "@/lib/horeca/bezorgen";

// ---------------------------------------------------------------------------
// Het bestellingenbord (15 nov 2026): elke bestelling als tegel in Nieuw, Bezig
// of Klaar, met een kleur die zegt wat er moet gebeuren (amber = wacht op jou,
// blauw = gepland, groen = onderweg, rood = te laat). Plus de rekenkunde van de
// bestellingenkaart: alle bezorgingen en de zaak in één beeld, op onze eigen
// tegels (/api/kaart/straat). Puur, dus ook in de browser en los te testen.
// ---------------------------------------------------------------------------

export interface BordBestelling {
  soort: string;
  status: string;
  createdAt: string;
  gewenstOp: string | null;
  bevestigdOp: string | null;
  onderwegOp: string | null;
  afgeleverdOp: string | null;
}

export type BordKolom = "nieuw" | "bezig" | "klaar";
export type BordToon = "wacht" | "gepland" | "onderweg" | "laat" | "af";

const isLevering = (b: { soort: string }) => b.soort === "afhalen" || b.soort === "bezorgen";

/** Nieuw = de zaak moet nog iets doen (tijd bevestigen, of de keuken begint nog); Bezig; Klaar = afgerond of geannuleerd. */
export function kolomVan(b: BordBestelling): BordKolom {
  if (b.status === "GEANNULEERD") return "klaar";
  if (isLevering(b)) {
    const f = leverFase(b);
    if (f === "afgeleverd") return "klaar";
    return f === "bevestigen" ? "nieuw" : "bezig";
  }
  if (b.status === "GESERVEERD") return "klaar";
  return b.status === "NIEUW" ? "nieuw" : "bezig";
}

/** Het moment dat telt: de toegezegde (of gevraagde) tijd bij afhalen en bezorgen, anders het moment van bestellen. */
export const momentVan = (b: BordBestelling) => (isLevering(b) ? (b.bevestigdOp ?? b.gewenstOp) : null);

/** Hoe de tegel kleurt. Een levering is te laat als de toegezegde tijd voorbij is; een tafel na 20 minuten zonder klaar. */
export function toonVan(b: BordBestelling, nu: number): BordToon {
  const k = kolomVan(b);
  if (k === "klaar") return "af";
  if (isLevering(b)) {
    const f: LeverFase = leverFase(b);
    if (f === "bevestigen") return "wacht";
    const op = b.bevestigdOp ? Date.parse(b.bevestigdOp) : NaN;
    if (Number.isFinite(op) && nu > op + 5 * 60_000) return "laat";
    return f === "onderweg" ? "onderweg" : "gepland";
  }
  if (nu - Date.parse(b.createdAt) > 20 * 60_000 && b.status !== "KLAAR") return "laat";
  return k === "nieuw" ? "wacht" : "gepland";
}

/** Volgorde binnen een kolom: eerst wat het eerst moet (toegezegde tijd, anders besteld), ZSM vooraan. */
export function sorteer<T extends BordBestelling>(lijst: readonly T[]): T[] {
  const sleutel = (b: T) => {
    const m = momentVan(b);
    return m ? Date.parse(m) : Date.parse(b.createdAt);
  };
  return [...lijst].sort((a, b) => sleutel(a) - sleutel(b));
}

// --- de bestellingenkaart ---------------------------------------------------

export interface KaartBeeld {
  zoom: number;
  /** de tegels die het beeld vullen, met hun plaats in beeldpunten vanaf linksboven */
  tegels: { x: number; y: number; links: number; boven: number }[];
  /** de punten in dezelfde volgorde als de invoer, in beeldpunten vanaf linksboven */
  punten: { x: number; y: number }[];
}

/**
 * Een kaartbeeld van `breedte` × `hoogte` beeldpunten waarin alle punten passen,
 * zo ver mogelijk ingezoomd (tussen minZoom en maxZoom) met wat marge rond de rand.
 */
export function kaartBeeld(punten: readonly { lat: number; lng: number }[], breedte: number, hoogte: number, opties: { minZoom?: number; maxZoom?: number; marge?: number } = {}): KaartBeeld | null {
  if (!punten.length || breedte <= 0 || hoogte <= 0) return null;
  const { minZoom = 10, maxZoom = 16, marge = 32 } = opties;
  let zoom = minZoom;
  for (let z = maxZoom; z >= minZoom; z -= 1) {
    const px = punten.map((p) => tegelPositie(p.lat, p.lng, z));
    const xs = px.map((p) => p.x * TEGEL);
    const ys = px.map((p) => p.y * TEGEL);
    if (Math.max(...xs) - Math.min(...xs) <= breedte - 2 * marge && Math.max(...ys) - Math.min(...ys) <= hoogte - 2 * marge) {
      zoom = z;
      break;
    }
  }
  const wereld = punten.map((p) => {
    const t = tegelPositie(p.lat, p.lng, zoom);
    return { x: t.x * TEGEL, y: t.y * TEGEL };
  });
  const xs = wereld.map((p) => p.x);
  const ys = wereld.map((p) => p.y);
  const ox = (Math.min(...xs) + Math.max(...xs)) / 2 - breedte / 2;
  const oy = (Math.min(...ys) + Math.max(...ys)) / 2 - hoogte / 2;
  const n = 2 ** zoom;
  const tegels: KaartBeeld["tegels"] = [];
  for (let y = Math.floor(oy / TEGEL); y <= Math.floor((oy + hoogte) / TEGEL); y += 1) {
    for (let x = Math.floor(ox / TEGEL); x <= Math.floor((ox + breedte) / TEGEL); x += 1) {
      if (x < 0 || y < 0 || x >= n || y >= n) continue;
      tegels.push({ x, y, links: Math.round(x * TEGEL - ox), boven: Math.round(y * TEGEL - oy) });
    }
  }
  return { zoom, tegels, punten: wereld.map((p) => ({ x: Math.round(p.x - ox), y: Math.round(p.y - oy) })) };
}
