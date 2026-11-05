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
import { access, mkdir, rename, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { createWorker, type Worker } from "tesseract.js";
import { AppError } from "@/lib/errors";

export const OCR_TALEN = ["nld", "eng"] as const;
const TAAL_BRON = "https://github.com/tesseract-ocr/tessdata_fast/raw/main";
const MAX_PIXELS = 40_000_000;
const STIL_MS = 10 * 60_000;

export const OCR_DATA_DIR = process.env.OCR_DATA_DIR || path.join(process.cwd(), "storage", "ocr");

export interface OcrUitkomst {
  tekst: string;
  /** 0–100, zoals tesseract het schat */
  vertrouwen: number;
  ms: number;
}

interface Staat {
  worker: Promise<Worker> | null;
  keten: Promise<unknown>;
  timer: ReturnType<typeof setTimeout> | null;
  talen: Promise<void> | null;
}

const g = globalThis as unknown as { __zfOcr?: Staat };
const staat = (): Staat => (g.__zfOcr ??= { worker: null, keten: Promise.resolve(), timer: null, talen: null });

const bestaat = (p: string) =>
  access(p).then(
    () => true,
    () => false,
  );

/** Zorgt dat de taalbestanden op schijf staan (eenmalig ophalen). */
async function zorgVoorTalen(): Promise<void> {
  const s = staat();
  if (!s.talen) {
    s.talen = (async () => {
      await mkdir(OCR_DATA_DIR, { recursive: true });
      for (const taal of OCR_TALEN) {
        const doel = path.join(OCR_DATA_DIR, `${taal}.traineddata`);
        if (await bestaat(doel)) continue;
        const res = await fetch(`${TAAL_BRON}/${taal}.traineddata`, { signal: AbortSignal.timeout(120_000) });
        if (!res.ok) throw new Error(`taalbestand ${taal}: HTTP ${res.status}`);
        const bytes = Buffer.from(await res.arrayBuffer());
        if (bytes.length < 500_000) throw new Error(`taalbestand ${taal}: te klein (${bytes.length} bytes)`);
        // eerst ernaast schrijven, dan hernoemen: een halve download is nooit "klaar"
        const tmp = `${doel}.${process.pid}.tmp`;
        await writeFile(tmp, bytes);
        await rename(tmp, doel);
      }
    })().catch((err: unknown) => {
      s.talen = null; // volgende keer opnieuw proberen
      throw err;
    });
  }
  return s.talen;
}

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

function planStop(): void {
  const s = staat();
  if (s.timer) clearTimeout(s.timer);
  const timer = setTimeout(() => {
    const w = s.worker;
    s.worker = null;
    s.timer = null;
    void w?.then((x) => x.terminate()).catch(() => undefined);
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

/** Voor beheer en controle: staan de taalbestanden er al? */
export async function ocrStand(): Promise<{ map: string; talen: Record<string, boolean> }> {
  const talen: Record<string, boolean> = {};
  for (const taal of OCR_TALEN) talen[taal] = await bestaat(path.join(OCR_DATA_DIR, `${taal}.traineddata`));
  return { map: OCR_DATA_DIR, talen };
}
