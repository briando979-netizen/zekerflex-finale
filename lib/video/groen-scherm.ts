import type { GroenScherm } from "@/lib/video/model";

// ---------------------------------------------------------------------------
// Groen scherm (13 nov 2026): een effen achtergrond (groen, blauw) doorzichtig maken, zodat de persoon ervoor over een
// ander beeld komt. Gekeken wordt naar de kleur zelf (Cb/Cr), niet naar de helderheid: een schaduw op het doek gaat
// ook weg. Met een zachte rand en zonder de groene gloed langs de randen. Puur (werkt op de pixels die de tekenaar
// geeft): lib/video/teken.ts en de tests gebruiken dit.
// ---------------------------------------------------------------------------

export const STANDAARD_GROEN: GroenScherm = { kleur: "#00b140", drempel: 0.18, zachtheid: 0.12 };

export function hexNaarRgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return [0, 177, 64];
  return [parseInt(m[1] ?? "0", 16), parseInt(m[2] ?? "0", 16), parseInt(m[3] ?? "0", 16)];
}

/** Kleur zonder helderheid (BT.601, 0..1): blauw-geel en rood-groen. */
function kleurAs(r: number, g: number, b: number): [number, number] {
  return [-0.168736 * r - 0.331264 * g + 0.5 * b, 0.5 * r - 0.418688 * g - 0.081312 * b];
}

/**
 * Maak in RGBA-pixels (zoals ImageData.data) de kleur `kleur` doorzichtig: dichterbij dan `drempel` helemaal, tot
 * `drempel + zachtheid` geleidelijk. Bij een groene of blauwe achtergrond gaat ook de gloed van die kleur weg langs de
 * randen. Werkt in de lijst zelf.
 */
export function haalKleurWeg(data: Uint8ClampedArray, kleur: readonly [number, number, number], drempel: number, zachtheid: number): void {
  const [kb, kr] = kleurAs(kleur[0] / 255, kleur[1] / 255, kleur[2] / 255);
  const zacht = Math.max(1e-3, zachtheid);
  const groen = kleur[1] >= kleur[0] && kleur[1] >= kleur[2];
  const blauw = !groen && kleur[2] >= kleur[0] && kleur[2] >= kleur[1];
  for (let i = 0; i + 3 < data.length; i += 4) {
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    const [cb, cr] = kleurAs(r / 255, g / 255, b / 255);
    const db = cb - kb;
    const dr = cr - kr;
    const afstand = Math.sqrt(db * db + dr * dr);
    if (afstand >= drempel + zacht) continue;
    const dekking = afstand <= drempel ? 0 : (afstand - drempel) / zacht;
    data[i + 3] = Math.round((data[i + 3] ?? 255) * dekking);
    if (dekking > 0) {
      // de gloed van het doek langs de randen weg: niet groener (of blauwer) dan de andere twee kleuren
      if (groen && g > Math.max(r, b)) data[i + 1] = Math.max(r, b);
      if (blauw && b > Math.max(r, g)) data[i + 2] = Math.max(r, g);
    }
  }
}
