// ---------------------------------------------------------------------------
// Live meten van het document voor de camera van de ID-scan (POST /api/onboarding/document-live, 12 nov 2026).
// De browser stuurt de uitsnede van het kader zodra het beeld scherp en stil is (lib/kyc/camera-live.ts). Hier:
//  - is de code onderaan (MRZ) leesbaar? Eén snelle OCR-poging op de onderkant, in dezelfde wachtrij als de rest
//    (lib/ocr/engine.ts). Terug gaat alleen ja/nee: de gelezen tekst bevat het BSN en verlaat deze functie nooit.
//  - hoe groot staat de pasfoto in het kader? Alleen de detector (YuNet, lib/kyc/gezicht/live.ts), geen
//    gezichtskenmerken. Terug gaat alleen de breedte als deel van het kader.
// Het beeld blijft in het geheugen: niets wordt bewaard of gelogd, en dit raakt de live reeks van de selfies niet.
// ---------------------------------------------------------------------------

import sharp from "sharp";
import { leesMrzTekst } from "@/lib/ocr/engine";
import { leesMrzUitTekst } from "@/lib/kyc/mrz";
import { meetLive } from "@/lib/kyc/gezicht/live";
import type { DocServerMeting } from "@/lib/kyc/camera-live";

const MAX_PIXELS = 8_000_000;

/** Is de code onderaan leesbaar, met kloppende controlecijfers? Eén poging (een rechte foto lukt in één keer). */
export async function mrzLeesbaar(bytes: Uint8Array, nu: Date = new Date()): Promise<boolean> {
  const rechtop = await sharp(bytes, { failOn: "error", limitInputPixels: MAX_PIXELS }).rotate().png().toBuffer();
  const meta = await sharp(rechtop).metadata();
  const breed = meta.width ?? 0;
  const hoog = meta.height ?? 0;
  if (!breed || !hoog) return false;
  // de code staat in het onderste deel van het document (bij een paspoort onder de pasfoto)
  const top = Math.floor(hoog * 0.55);
  const png = await sharp(rechtop)
    .extract({ left: 0, top, width: breed, height: hoog - top })
    .resize({ width: 1800 })
    .grayscale()
    .normalise()
    .sharpen()
    .png()
    .toBuffer();
  const { tekst } = await leesMrzTekst(png);
  return leesMrzUitTekst(tekst, nu)?.geldig === true;
}

/** De pasfoto: de breedte van het grootste gezicht als deel van het kader, of null als er geen gezicht is. */
export async function portretBreedte(bytes: Uint8Array): Promise<number | null> {
  const m = await meetLive(bytes);
  return m ? Math.round(m.breedteDeel * 1000) / 1000 : null;
}

export async function meetDocumentLive(bytes: Uint8Array, wat: { mrz: boolean; portret: boolean }): Promise<DocServerMeting> {
  // eerst de pasfoto (snel), dan de code (OCR, in de wachtrij)
  const portret = wat.portret ? await portretBreedte(bytes).catch(() => null) : null;
  const leesbaar = wat.mrz ? await mrzLeesbaar(bytes).catch(() => false) : null;
  return { leesbaar, portret };
}
