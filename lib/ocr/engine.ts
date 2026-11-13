// ---------------------------------------------------------------------------
// Eigen OCR (4 nov 2026): tesseract.js draait in de app zelf, zonder externe
// dienst en zonder kosten. De taalbestanden (Nederlands + Engels, tessdata_fast)
// staan op het opslagvolume (storage/ocr) en worden bij het eerste gebruik één
// keer opgehaald; daarna werkt alles zonder netwerk. Eén worker per proces
// (globalThis, want Next bundelt routes apart), opdrachten na elkaar, en de
// worker stopt zichzelf na tien minuten stilte.
// De tekst die hieruit komt, leest lib/ocr/lezen.ts uit tot velden.
// ---------------------------------------------------------------------------

import path from "node:path";
import sharp from "sharp";
import { createWorker, PSM, type Worker } from "tesseract.js";
import { AppError } from "@/lib/errors";
import { OCR_DATA_DIR, OCR_TALEN, taalBestandKlaar, zorgVoorTalen } from "@/lib/ocr/talen";

// de taalbestanden en hun download wonen in lib/ocr/talen.ts (licht, zodat ook de opstart ze mag laden)
export { OCR_DATA_DIR, OCR_TALEN };

const MAX_PIXELS = 40_000_000;
const STIL_MS = 10 * 60_000;

export interface OcrUitkomst {
  tekst: string;
  /** 0–100, zoals tesseract het schat */
  vertrouwen: number;
  ms: number;
}

interface Staat {
  worker: Promise<Worker> | null;
  /** aparte worker voor de MRZ van paspoort/ID-kaart (lib/kyc/mrz-lezen.ts): alleen A–Z 0–9 <, geen woordenboek */
  mrz?: Promise<Worker> | null;
  keten: Promise<unknown>;
  timer: ReturnType<typeof setTimeout> | null;
}

const g = globalThis as unknown as { __zfOcr?: Staat };
const staat = (): Staat => (g.__zfOcr ??= { worker: null, mrz: null, keten: Promise.resolve(), timer: null });

async function worker(): Promise<Worker> {
  const s = staat();
  if (!s.worker) {
    s.worker = (async () => {
      await zorgVoorTalen();
      return createWorker(OCR_TALEN.join("+"), 1, {
        langPath: OCR_DATA_DIR,
        cachePath: OCR_DATA_DIR,
        gzip: false,
        errorHandler: () => {
          // de worker is stuk: de volgende aanvraag start een nieuwe
          s.worker = null;
        },
      });
    })().catch((err: unknown) => {
      s.worker = null;
      throw err;
    });
  }
  return s.worker;
}

const MRZ_TEKENS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<";

async function mrzWorker(): Promise<Worker> {
  const s = staat();
  if (!s.mrz) {
    s.mrz = (async () => {
      await zorgVoorTalen();
      // zonder woordenboek: een MRZ bestaat niet uit woorden, en "verbeteren" naar woorden maakt hem kapot
      const w = await createWorker(
        "eng",
        1,
        {
          langPath: OCR_DATA_DIR,
          cachePath: OCR_DATA_DIR,
          gzip: false,
          errorHandler: () => {
            s.mrz = null;
          },
        },
        { load_system_dawg: "0", load_freq_dawg: "0" },
      );
      await w.setParameters({ tessedit_char_whitelist: MRZ_TEKENS, tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
      return w;
    })().catch((err: unknown) => {
      s.mrz = null;
      throw err;
    });
  }
  return s.mrz;
}

function planStop(): void {
  const s = staat();
  if (s.timer) clearTimeout(s.timer);
  const timer = setTimeout(() => {
    const w = s.worker;
    const m = s.mrz;
    s.worker = null;
    s.mrz = null;
    s.timer = null;
    void w?.then((x) => x.terminate()).catch(() => undefined);
    void m?.then((x) => x.terminate()).catch(() => undefined);
  }, STIL_MS);
  // de timer mag het proces nooit wakker houden
  timer.unref();
  s.timer = timer;
}

/**
 * Maakt van een foto iets wat de OCR goed leest: rechtop (EXIF), grijs,
 * contrast genormaliseerd, en een werkbare maat (kleine foto's iets groter,
 * grote kleiner). Alleen afbeeldingen; een PDF wordt niet gerasterd.
 */
export async function maakLeesbaar(bytes: Buffer): Promise<Buffer> {
  const basis = sharp(bytes, { failOn: "error", limitInputPixels: MAX_PIXELS, animated: false }).rotate();
  const meta = await basis.metadata();
  const breed = meta.width ?? 0;
  const klein = breed > 0 && breed < 1200;
  const doel = klein ? 2000 : 2600;
  return basis
    .resize({ width: doel, height: doel, fit: "inside", withoutEnlargement: !klein })
    .grayscale()
    .normalise()
    .sharpen()
    .png({ compressionLevel: 3 })
    .toBuffer();
}

/** Leest de tekst van een foto (JPG/PNG/WebP). Gooit AppError.upstream als de OCR zelf faalt. */
export async function leesTekst(bytes: Buffer): Promise<OcrUitkomst> {
  const t0 = Date.now();
  let png: Buffer;
  try {
    png = await maakLeesbaar(bytes);
  } catch {
    throw AppError.validation("De foto kon niet worden gelezen. Probeer een scherpe JPG of PNG.");
  }
  const s = staat();
  const klus = s.keten.then(async () => {
    const w = await worker();
    const { data } = await w.recognize(png);
    return { tekst: data.text, vertrouwen: Math.round(data.confidence) };
  });
  // de keten loopt altijd door, ook na een mislukte klus
  s.keten = klus.catch(() => undefined);
  try {
    const uit = await klus;
    return { ...uit, ms: Date.now() - t0 };
  } catch (err) {
    s.worker = null;
    throw AppError.upstream(`OCR mislukt: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    planStop();
  }
}

/**
 * Leest een al voorbewerkte uitsnede (PNG) met de MRZ-worker. Loopt in dezelfde
 * wachtrij als leesTekst: nooit twee zware OCR-klussen tegelijk op de server.
 */
export async function leesMrzTekst(png: Buffer): Promise<OcrUitkomst> {
  const t0 = Date.now();
  const s = staat();
  const klus = s.keten.then(async () => {
    const w = await mrzWorker();
    const { data } = await w.recognize(png);
    return { tekst: data.text, vertrouwen: Math.round(data.confidence) };
  });
  s.keten = klus.catch(() => undefined);
  try {
    const uit = await klus;
    return { ...uit, ms: Date.now() - t0 };
  } catch (err) {
    s.mrz = null;
    throw AppError.upstream(`OCR mislukt: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    planStop();
  }
}

/** Voor beheer en controle: staan de taalbestanden er al? */
export async function ocrStand(): Promise<{ map: string; talen: Record<string, boolean> }> {
  const talen: Record<string, boolean> = {};
  for (const taal of OCR_TALEN) talen[taal] = await taalBestandKlaar(path.join(OCR_DATA_DIR, `${taal}.traineddata`));
  return { map: OCR_DATA_DIR, talen };
}
