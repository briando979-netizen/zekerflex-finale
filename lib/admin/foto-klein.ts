import sharp from "sharp";

// ---------------------------------------------------------------------------
// Een kleine versie van een ID-foto voor de tegels in Admin → Gebruikers (12 nov 2026). Gemeten in het
// toegangslog: de tegels (±200 px) laadden elke foto op volle grootte (1–2 MB), en met 14 tegelijk duurde één
// foto 29 s (p50). De kleine versie is ±800 px breed: ook op een scherm met dubbele dichtheid scherp op de
// tegel. Een klik op de tegel opent nog altijd het volle origineel. Niets wordt bewaard.
// ---------------------------------------------------------------------------

export const KLEIN_BREEDTE = 800;
const MAX_PIXELS = 40_000_000;

/**
 * Rechtop gezet volgens de EXIF, hooguit KLEIN_BREEDTE breed (nooit groter dan het origineel), JPEG 80.
 * Zonder metadata: sharp neemt EXIF, GPS en ICC alleen mee met withMetadata(), en dat staat hier bewust niet.
 * Lukt het niet (geen afbeelding, kapot bestand), dan null: de route geeft dan het origineel, nooit een lege tegel.
 */
export async function kleineVersie(bytes: Uint8Array): Promise<Uint8Array | null> {
  try {
    const uit = await sharp(bytes, { failOn: "error", limitInputPixels: MAX_PIXELS, animated: false })
      .rotate()
      .resize({ width: KLEIN_BREEDTE, withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    return new Uint8Array(uit);
  } catch {
    return null;
  }
}
