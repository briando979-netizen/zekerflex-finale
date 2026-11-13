// ---------------------------------------------------------------------------
// De taalbestanden van de eigen OCR (Nederlands + Engels, tessdata_fast) op het opslagvolume (storage/ocr).
// Een eigen, lichte module (geen sharp of tesseract.js): ook de opstart (instrumentation.ts) mag hem laden zonder
// dat het geheugen meteen vol zit. GitHub is alleen de bron van de eerste download; daarna werkt alles van onze
// eigen kopie, zonder netwerk.
//
//  - Nooit een half bestand: eerst naar een tijdelijk bestand, dan hernoemen. Een bestand dat te klein is, telt niet.
//  - Mislukt een download, dan wordt hij bij de eerstvolgende aanroep opnieuw geprobeerd (er blijft niets hangen).
//  - Maximaal één download tegelijk per map (ook als routes apart gebundeld zijn: globalThis).
// ---------------------------------------------------------------------------

import path from "node:path";
import { mkdir, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";

export const OCR_TALEN = ["nld", "eng"] as const;
export const TAAL_BRON = "https://github.com/tesseract-ocr/tessdata_fast/raw/main";
export const OCR_DATA_DIR = process.env.OCR_DATA_DIR || path.join(process.cwd(), "storage", "ocr");

/** Een taalbestand kleiner dan dit is afgebroken of kapot. */
const MIN_BYTES = 500_000;
/** Een tijdelijk bestand ouder dan dit is een restant van een afgebroken download. */
const TMP_OUD_MS = 10 * 60_000;

export interface TaalOpties {
  /** map met de taalbestanden (standaard storage/ocr) */
  dir?: string;
}

const g = globalThis as unknown as { __zfOcrTalen?: Map<string, Promise<void>> };

/** Staat dit taalbestand er, en is het groot genoeg om heel te zijn? */
export async function taalBestandKlaar(pad: string): Promise<boolean> {
  try {
    return (await stat(pad)).size >= MIN_BYTES;
  } catch {
    return false;
  }
}

async function ruimRestantenOp(dir: string): Promise<void> {
  const namen = await readdir(dir).catch(() => [] as string[]);
  for (const naam of namen) {
    if (!naam.endsWith(".tmp")) continue;
    const pad = path.join(dir, naam);
    try {
      if (Date.now() - (await stat(pad)).mtimeMs > TMP_OUD_MS) await unlink(pad);
    } catch {
      // een ander proces was ons voor: prima
    }
  }
}

async function haalOp(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  await ruimRestantenOp(dir);
  for (const taal of OCR_TALEN) {
    const doel = path.join(dir, `${taal}.traineddata`);
    if (await taalBestandKlaar(doel)) continue;
    const res = await fetch(`${TAAL_BRON}/${taal}.traineddata`, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) throw new Error(`taalbestand ${taal}: HTTP ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length < MIN_BYTES) throw new Error(`taalbestand ${taal}: te klein (${bytes.length} bytes)`);
    // eerst ernaast schrijven, dan hernoemen: een halve download is nooit "klaar"
    const tmp = `${doel}.${process.pid}.tmp`;
    try {
      await writeFile(tmp, bytes);
      await rename(tmp, doel);
    } catch (err) {
      await unlink(tmp).catch(() => undefined);
      throw err;
    }
  }
}

/** Zorgt dat de taalbestanden op schijf staan. Gooit bij een mislukking; de volgende aanroep probeert het opnieuw. */
export function zorgVoorTalen(opties: TaalOpties = {}): Promise<void> {
  const dir = opties.dir ?? OCR_DATA_DIR;
  const lopend = (g.__zfOcrTalen ??= new Map<string, Promise<void>>());
  let p = lopend.get(dir);
  if (!p) {
    p = haalOp(dir).finally(() => {
      lopend.delete(dir);
    });
    lopend.set(dir, p);
  }
  return p;
}

/**
 * Vooraf laden bij het opstarten (instrumentation.ts), op de achtergrond en fail-soft: alleen als er een
 * bestand ontbreekt, nooit een gooi. Het resultaat zegt wat er gebeurde; de aanroeper mag het loggen.
 */
export async function laadOcrVooraf(opties: TaalOpties = {}): Promise<"klaar" | "opgehaald" | "mislukt"> {
  const dir = opties.dir ?? OCR_DATA_DIR;
  const klaar = await Promise.all(OCR_TALEN.map((t) => taalBestandKlaar(path.join(dir, `${t}.traineddata`))));
  if (klaar.every(Boolean)) return "klaar";
  try {
    await zorgVoorTalen({ dir });
    return "opgehaald";
  } catch {
    return "mislukt";
  }
}
