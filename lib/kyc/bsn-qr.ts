// ---------------------------------------------------------------------------
// Het BSN uit de QR-code op de achterkant van een Nederlandse ID-kaart (13 nov 2026, stap iii). Sinds 2 aug 2021 staat
// het BSN niet meer in de MRZ of de chip (lib/kyc/bsn-uit-document.ts leest het dus alleen van oudere documenten), maar
// in een QR-code op de achterkant, met de cijfers ernaast. Officieel bevat die QR alleen het BSN, onversleuteld
// (Kamerantwoord ah-tk-20192020-629 antwoord 4; kst-25764-121); gemeten op een echte kaart op prod: precies 9 cijfers.
//
// Alleen op de server (sharp + jsQR), nooit in de browser. Een foto gaat via een ladder: eerst verkleind tot ±1080 breed,
// dan ±1600 (verkleinen middelt de ruis weg; op volle grootte vond jsQR in proeven niets en duurde het seconden), met een
// tijdslimiet. Terug gaat alleen een BsnVoorstel (hash + laatste 4, zoals hashBsn) of null: de tekst van de QR verlaat
// deze module nooit, een fout geeft stil null. Nooit loggen, nooit in rawPayload. De werker bevestigt het voorstel zelf.
// ---------------------------------------------------------------------------

import sharp from "sharp";
import jsQR from "jsqr";
import { hashBsn, validBsn } from "@/lib/fiscal/bsn";
import type { BsnVoorstel } from "@/lib/kyc/bsn-uit-document";

/** Hoe lang de QR-lezer hooguit mag zoeken; daarna stopt hij (de verificatie zelf wacht er nooit op). */
export const QR_TIJD_MS = 2000;
/** De ladder: de breedtes waarop jsQR zoekt, van snel naar grondig. */
export const QR_BREEDTES = [1080, 1600] as const;
/** Grotere foto's niet decoderen (een telefoonfoto is ±8 MP); beschermt het geheugen. */
const MAX_PIXELS = 40_000_000;

/**
 * Puur: de tekst uit de QR naar een voorstel. Precies één reeks van precies 9 cijfers (witruimte telt niet), die de
 * elfproef haalt; een langere reeks of twee reeksen van 9 is geen BSN-QR. Anders null.
 */
export function bsnVoorstelUitQrTekst(tekst: string | null | undefined): BsnVoorstel | null {
  if (typeof tekst !== "string" || tekst.length === 0 || tekst.length > 64) return null;
  const reeksen = tekst.replace(/\s+/g, "").match(/\d+/g) ?? [];
  const negen = reeksen.filter((r) => r.length === 9);
  if (negen.length !== 1 || reeksen.some((r) => r.length > 9)) return null;
  const cijfers = negen[0] ?? "";
  return validBsn(cijfers) ? hashBsn(cijfers) : null;
}

/** De foto op een breedte als RGBA voor jsQR (sharp geeft 1–4 kanalen terug; jsQR wil er altijd 4). */
async function rgba(foto: Buffer, breedte: number): Promise<{ data: Uint8ClampedArray; w: number; h: number }> {
  const { data, info } = await sharp(foto, { limitInputPixels: MAX_PIXELS })
    .rotate()
    .resize({ width: breedte, withoutEnlargement: true, kernel: "linear" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const n = info.width * info.height;
  const k = info.channels;
  const uit = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    const r = data[i * k] ?? 0;
    uit[i * 4] = r;
    uit[i * 4 + 1] = k >= 3 ? (data[i * k + 1] ?? r) : r;
    uit[i * 4 + 2] = k >= 3 ? (data[i * k + 2] ?? r) : r;
    uit[i * 4 + 3] = 255;
  }
  return { data: uit, w: info.width, h: info.height };
}

/**
 * Zoekt de BSN-QR op de foto's (in volgorde: eerst de achterkant, daarna de andere foto als iemand ze verwisselde), met
 * één tijdslimiet voor alles. Geeft alleen een voorstel of null terug; een fout of een time-out is stil null.
 */
export async function leesBsnUitQr(fotos: readonly Buffer[], tijdMs: number = QR_TIJD_MS, klok: () => number = Date.now): Promise<BsnVoorstel | null> {
  const grens = klok() + tijdMs;
  for (const foto of fotos) {
    let breedteFoto = 0;
    try {
      const meta = await sharp(foto, { limitInputPixels: MAX_PIXELS }).metadata();
      breedteFoto = ((meta.orientation ?? 1) >= 5 ? meta.height : meta.width) ?? 0;
    } catch {
      continue;
    }
    for (const [i, breedte] of QR_BREEDTES.entries()) {
      // een kleinere foto hoeft maar één keer: de grotere stap zou hetzelfde beeld opnieuw doorzoeken
      if (i > 0 && breedteFoto <= (QR_BREEDTES[i - 1] ?? 0)) break;
      if (klok() > grens) return null;
      try {
        const beeld = await rgba(foto, breedte);
        const gevonden = jsQR(beeld.data, beeld.w, beeld.h, { inversionAttempts: "dontInvert" });
        if (gevonden && gevonden.data) return bsnVoorstelUitQrTekst(gevonden.data);
      } catch {
        // een kapotte of vreemde foto: gewoon geen voorstel
      }
    }
  }
  return null;
}
