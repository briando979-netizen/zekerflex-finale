// Het kaartje in een chatbericht met een locatie (zoals in WhatsApp): een stukje straatkaart rond de plek, samengesteld uit
// tegels van onze eigen route /api/kaart/straat (PDOK BRT Achtergrondkaart, alleen Nederland). Dit bestand is puur: de
// tegelrekenkunde en de grens van Nederland, zodat de browser het mag importeren en het los te testen is.

export const TEGEL = 256;
export const VOORBEELD_ZOOM = 16;

/** Ligt de plek op de kaart van Nederland (met een marge)? Alleen daar bestaan de tegels; elders blijft het gewone blokje over. */
export const inNederland = (lat: number, lng: number): boolean => Number.isFinite(lat) && Number.isFinite(lng) && lat >= 50.7 && lat <= 53.6 && lng >= 3.2 && lng <= 7.3;

/** De tegelcoördinaten (met decimalen) van een plek bij een zoomniveau: web-mercator. */
export function tegelPositie(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const n = 2 ** zoom;
  const rad = (lat * Math.PI) / 180;
  return { x: ((lng + 180) / 360) * n, y: ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n };
}

export interface KaartTegel {
  x: number;
  y: number;
  /** hoeveel beeldpunten rechts (links) van het midden van het kaartje deze tegel begint */
  links: number;
  /** hoeveel beeldpunten onder (boven) het midden van het kaartje deze tegel begint */
  boven: number;
}

/** De 3 bij 3 tegels rond de plek, met hun plaats ten opzichte van het midden van het kaartje: de plek zelf ligt precies in het midden. */
export function tegelsRond(lat: number, lng: number, zoom: number = VOORBEELD_ZOOM): KaartTegel[] {
  const p = tegelPositie(lat, lng, zoom);
  const n = 2 ** zoom;
  const cx = Math.floor(p.x);
  const cy = Math.floor(p.y);
  const uit: KaartTegel[] = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= n || y >= n) continue;
      uit.push({ x, y, links: Math.round((x - p.x) * TEGEL), boven: Math.round((y - p.y) * TEGEL) });
    }
  }
  return uit;
}
