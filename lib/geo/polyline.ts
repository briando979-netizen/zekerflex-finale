// ---------------------------------------------------------------------------
// Een "encoded polyline" terug naar punten. Onze routeplanner (Valhalla) geeft
// de lijn van een route zo terug: lengte- en breedtegraad als verschil met het
// vorige punt, in stukjes van 5 bits als leesbare tekens. Valhalla rekent met 6
// cijfers achter de komma (polyline6), Google met 5; de volgorde in de tekst is
// breedte, lengte. Wij geven [lon, lat] terug, zoals GeoJSON en MapLibre willen.
// Puur rekenwerk, zodat het te testen is.
// ---------------------------------------------------------------------------

export type LonLat = [lon: number, lat: number];

/**
 * Lees een encoded polyline. Een kapotte tekst (afgebroken midden in een getal,
 * een teken buiten het bereik) geeft de punten tot daar, nooit een fout.
 */
export function decodePolyline(tekst: string, precisie = 6): LonLat[] {
  const factor = 10 ** precisie;
  const uit: LonLat[] = [];
  let i = 0;
  let lat = 0;
  let lon = 0;

  // één getal: stukjes van 5 bits, het zesde bit zegt "er komt nog een stukje"
  const leesGetal = (): number | null => {
    let resultaat = 0;
    let verschuiving = 0;
    for (;;) {
      if (i >= tekst.length) return null;
      const b = tekst.charCodeAt(i++) - 63;
      if (b < 0 || b > 63) return null;
      // vermenigvuldigen in plaats van <<: lange getallen passen niet in 32 bits
      resultaat += (b & 0x1f) * 2 ** verschuiving;
      verschuiving += 5;
      if (b < 0x20) break;
      if (verschuiving > 60) return null;
    }
    // het laagste bit is het teken (zigzag)
    return resultaat % 2 === 1 ? -(resultaat + 1) / 2 : resultaat / 2;
  };

  while (i < tekst.length) {
    const dLat = leesGetal();
    if (dLat === null) break;
    const dLon = leesGetal();
    if (dLon === null) break;
    lat += dLat;
    lon += dLon;
    uit.push([lon / factor, lat / factor]);
  }
  return uit;
}

/** Het omgekeerde: punten naar een encoded polyline (voor tests en om een lijn kort te bewaren). */
export function encodePolyline(punten: LonLat[], precisie = 6): string {
  const factor = 10 ** precisie;
  let uit = "";
  let vorigLat = 0;
  let vorigLon = 0;
  const schrijf = (getal: number) => {
    let v = getal < 0 ? -getal * 2 - 1 : getal * 2;
    while (v >= 0x20) {
      uit += String.fromCharCode((0x20 | (v % 32)) + 63);
      v = Math.floor(v / 32);
    }
    uit += String.fromCharCode(v + 63);
  };
  for (const [lon, lat] of punten) {
    const la = Math.round(lat * factor);
    const lo = Math.round(lon * factor);
    schrijf(la - vorigLat);
    schrijf(lo - vorigLon);
    vorigLat = la;
    vorigLon = lo;
  }
  return uit;
}
