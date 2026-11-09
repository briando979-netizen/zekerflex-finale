// ---------------------------------------------------------------------------
// MRZ van een foto lezen (9 nov 2026): de eigen OCR (lib/ocr/engine.ts, MRZ-
// worker) op een paar uitsneden van de foto, de waarschijnlijkste eerst. De
// MRZ staat onderaan: bij een ID-kaart op de achterkant, bij een paspoort onder
// de pasfoto. We stoppen bij de eerste uitsnede waarvan alle controlecijfers
// kloppen; anders geven we de beste gedeeltelijke lezing terug.
//
// Privacy: de gelezen tekst bevat het BSN (vrij veld). Hij verlaat deze functie
// nooit en komt in geen log; terug gaat alleen de uitslag van lib/kyc/mrz.ts,
// waar het vrije veld al uit is.
// ---------------------------------------------------------------------------

import sharp from "sharp";
import { leesMrzTekst } from "@/lib/ocr/engine";
import { leesMrzUitTekst, type MrzUitslag } from "@/lib/kyc/mrz";

const MAX_PIXELS = 40_000_000;
const MAX_POGINGEN = 8;

export interface MrzLeesUitslag {
  /** de beste lezing, of null als er nergens een MRZ te vinden was */
  uitslag: MrzUitslag | null;
  pogingen: number;
  ms: number;
}

type Uitsnede = () => Promise<Buffer>;

/** De onderkant van de foto (waar de MRZ staat), groot en scherp genoeg voor de OCR. */
function uitsneden(bytes: Buffer): Uitsnede[] {
  // sharp doet één rotatie per bewerking: eerst rechtop volgens de EXIF (één keer), daarna eventueel 180°
  let rechtopVast: Promise<Buffer> | null = null;
  const rechtopEens = () => (rechtopVast ??= sharp(bytes, { failOn: "error", limitInputPixels: MAX_PIXELS, animated: false }).rotate().png().toBuffer());
  const basis = async () => sharp(await rechtopEens());
  // draai in graden: 180 = ondersteboven, een paar graden = een scheef gehouden telefoon
  const onderkant = async (draai: number, drempel: boolean): Promise<Buffer> => {
    const rechtop = draai ? await (await basis()).rotate(draai, { background: "#ffffff" }).png().toBuffer() : await rechtopEens();
    const meta = await sharp(rechtop).metadata();
    const breed = meta.width ?? 0;
    const hoog = meta.height ?? 0;
    if (!breed || !hoog) throw new Error("leeg beeld");
    const top = Math.floor(hoog * 0.55);
    let stap = sharp(rechtop)
      .extract({ left: 0, top, width: breed, height: hoog - top })
      .resize({ width: 1800 })
      .grayscale()
      .normalise()
      .sharpen();
    if (drempel) stap = stap.threshold(135);
    return stap.png().toBuffer();
  };
  // de waarschijnlijkste eerst: een rechte foto is in één poging (< 1 s) gelezen
  return [
    () => onderkant(0, false),
    async () => (await basis()).resize({ width: 2200, withoutEnlargement: false }).grayscale().normalise().sharpen().png().toBuffer(),
    () => onderkant(-2, false),
    () => onderkant(2, false),
    () => onderkant(180, false),
    () => onderkant(-4, false),
    () => onderkant(4, false),
    () => onderkant(0, true),
  ];
}

/** Hoeveel controlecijfers kloppen er: om de beste gedeeltelijke lezing te kiezen. */
const score = (u: MrzUitslag): number => Object.values(u.controles).filter(Boolean).length;

/** Leest de MRZ van een foto van een paspoort of ID-kaart. Gooit alleen als de foto zelf onleesbaar is. */
export async function leesMrzVanFoto(bytes: Buffer, nu: Date = new Date()): Promise<MrzLeesUitslag> {
  const t0 = Date.now();
  let beste: MrzUitslag | null = null;
  let pogingen = 0;
  for (const maak of uitsneden(bytes).slice(0, MAX_POGINGEN)) {
    let png: Buffer;
    try {
      png = await maak();
    } catch {
      continue; // deze uitsnede lukt niet (bijv. te klein beeld): de volgende proberen
    }
    pogingen++;
    const { tekst } = await leesMrzTekst(png);
    const u = leesMrzUitTekst(tekst, nu);
    if (u && (!beste || score(u) > score(beste))) beste = u;
    if (beste?.geldig) break;
  }
  return { uitslag: beste, pogingen, ms: Date.now() - t0 };
}

/** Wat de werker en de beheerder te zien krijgen: geen BSN, geen geboortedatum, geen ruwe tekst. */
export interface MrzVoorScherm {
  gevonden: boolean;
  geldig: boolean;
  soort: MrzUitslag["soort"] | null;
  land: string | null;
  documentnummer: string | null;
  vervaldatum: string | null;
  verlopen: boolean;
  achternaam: string | null;
  voornamen: string | null;
  controles: MrzUitslag["controles"] | null;
}

export function voorScherm(u: MrzUitslag | null): MrzVoorScherm {
  if (!u) {
    return { gevonden: false, geldig: false, soort: null, land: null, documentnummer: null, vervaldatum: null, verlopen: false, achternaam: null, voornamen: null, controles: null };
  }
  return {
    gevonden: true,
    geldig: u.geldig,
    soort: u.soort,
    land: u.land,
    documentnummer: u.controles.documentnummer ? u.documentnummer : null,
    vervaldatum: u.controles.vervaldatum ? u.vervaldatum : null,
    verlopen: u.controles.vervaldatum && u.verlopen,
    achternaam: u.achternaam || null,
    voornamen: u.voornamen || null,
    controles: u.controles,
  };
}
