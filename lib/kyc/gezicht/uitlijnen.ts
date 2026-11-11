// ---------------------------------------------------------------------------
// Een gezicht rechtzetten voor SFace: vijf punten (ogen, neus, mondhoeken) worden met een
// gelijkvormigheidstransformatie (draaien, schalen, verschuiven) op de vaste plekken van een
// 112 × 112-gezicht gelegd. Puur rekenwerk op een RGB-buffer, zonder beeldbibliotheek.
// ---------------------------------------------------------------------------

import type { Punt } from "@/lib/kyc/gezicht/detector";

export const UITGELIJND = 112;

/** De vijf vaste plekken in een uitgelijnd gezicht van 112 × 112 (zelfde volgorde als de detector). */
export const DOEL_PUNTEN: readonly Punt[] = [
  { x: 38.2946, y: 51.6963 },
  { x: 73.5318, y: 51.5014 },
  { x: 56.0252, y: 71.7366 },
  { x: 41.5493, y: 92.3655 },
  { x: 70.7299, y: 92.2041 },
];

/** x' = a·x − b·y + tx, y' = b·x + a·y + ty */
export interface Gelijkvormig {
  a: number;
  b: number;
  tx: number;
  ty: number;
}

/** Kleinste-kwadraten gelijkvormigheid van `van` naar `naar` (Umeyama, zonder spiegelen). */
export function schatGelijkvormig(van: readonly Punt[], naar: readonly Punt[]): Gelijkvormig | null {
  const n = Math.min(van.length, naar.length);
  if (n < 2) return null;
  let mvx = 0;
  let mvy = 0;
  let mnx = 0;
  let mny = 0;
  for (let i = 0; i < n; i++) {
    mvx += van[i]!.x;
    mvy += van[i]!.y;
    mnx += naar[i]!.x;
    mny += naar[i]!.y;
  }
  mvx /= n;
  mvy /= n;
  mnx /= n;
  mny /= n;
  let noemer = 0;
  let re = 0;
  let im = 0;
  for (let i = 0; i < n; i++) {
    const sx = van[i]!.x - mvx;
    const sy = van[i]!.y - mvy;
    const dx = naar[i]!.x - mnx;
    const dy = naar[i]!.y - mny;
    noemer += sx * sx + sy * sy;
    re += sx * dx + sy * dy;
    im += sx * dy - sy * dx;
  }
  if (noemer < 1e-9) return null;
  const a = re / noemer;
  const b = im / noemer;
  return { a, b, tx: mnx - (a * mvx - b * mvy), ty: mny - (b * mvx + a * mvy) };
}

/** Het ontbrekende stukje: zet een punt van het doel terug naar het bronbeeld. */
function omgekeerd(m: Gelijkvormig, x: number, y: number): Punt {
  const det = m.a * m.a + m.b * m.b;
  const px = x - m.tx;
  const py = y - m.ty;
  return { x: (m.a * px + m.b * py) / det, y: (-m.b * px + m.a * py) / det };
}

/**
 * Snijdt het gezicht uit een RGB-beeld (3 bytes per pixel) en geeft 112 × 112 × 3 bytes terug,
 * of `null` als de punten onbruikbaar zijn. Tussenliggende pixels worden lineair gemengd.
 */
export function lijnUit(rgb: Uint8Array, breedte: number, hoogte: number, punten: readonly Punt[]): Uint8Array | null {
  const m = schatGelijkvormig(punten, DOEL_PUNTEN);
  if (!m) return null;
  const det = m.a * m.a + m.b * m.b;
  // een gezicht dat nauwelijks schaalt is een fout in de punten (alles op één plek)
  if (det < 1e-6) return null;
  const uit = new Uint8Array(UITGELIJND * UITGELIJND * 3);
  const klem = (v: number, max: number): number => (v < 0 ? 0 : v > max ? max : v);
  for (let v = 0; v < UITGELIJND; v++) {
    for (let u = 0; u < UITGELIJND; u++) {
      const bron = omgekeerd(m, u, v);
      const x = klem(bron.x, breedte - 1);
      const y = klem(bron.y, hoogte - 1);
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const x1 = Math.min(x0 + 1, breedte - 1);
      const y1 = Math.min(y0 + 1, hoogte - 1);
      const fx = x - x0;
      const fy = y - y0;
      const o = (v * UITGELIJND + u) * 3;
      for (let k = 0; k < 3; k++) {
        const p00 = rgb[(y0 * breedte + x0) * 3 + k] ?? 0;
        const p10 = rgb[(y0 * breedte + x1) * 3 + k] ?? 0;
        const p01 = rgb[(y1 * breedte + x0) * 3 + k] ?? 0;
        const p11 = rgb[(y1 * breedte + x1) * 3 + k] ?? 0;
        const boven = p00 + (p10 - p00) * fx;
        const onder = p01 + (p11 - p01) * fx;
        uit[o + k] = Math.round(boven + (onder - boven) * fy);
      }
    }
  }
  return uit;
}

/**
 * Maakt een RGB-gezicht grijs (helderheid volgens ITU-R BT.601, in alle drie de kanalen). De pasfoto op een
 * paspoort of ID-kaart is meestal grijs in het document gelaserd, de selfie is in kleur: door beide grijs te
 * vergelijken telt de kleur niet meer mee. Gemeten op de echte controles van 11 nov 2026 (6 personen, 9
 * pogingen): dezelfde persoon scoorde tot 0,05 hoger, andere personen tegen elkaar bleven op hooguit 0,21.
 */
export function naarGrijs(rgb: Uint8Array): Uint8Array {
  const uit = new Uint8Array(rgb.length);
  for (let i = 0; i + 2 < rgb.length; i += 3) {
    const y = Math.round(0.299 * (rgb[i] ?? 0) + 0.587 * (rgb[i + 1] ?? 0) + 0.114 * (rgb[i + 2] ?? 0));
    uit[i] = y;
    uit[i + 1] = y;
    uit[i + 2] = y;
  }
  return uit;
}
