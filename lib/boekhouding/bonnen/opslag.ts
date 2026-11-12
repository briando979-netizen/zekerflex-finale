// ---------------------------------------------------------------------------
// Bonnen: het bestand op het opslagvolume (storage/), nooit in public/ (de container wordt bij elke uitrol vervangen).
// Er is bewust GEEN verwijderfunctie: een bon wordt zeven jaar bewaard. Alleen de testadministratie mag leeg
// (wisTestAdministratie wist de rijen; de bestanden van een testadministratie blijven hooguit als wees liggen).
// ---------------------------------------------------------------------------

import path from "node:path";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { AppError } from "@/lib/errors";
import { isBonPad } from "./bestand";

export const BONNEN_ROOT = process.env.BONNEN_DIR || path.join(process.cwd(), "storage");

function volledigPad(relatief: string): string {
  if (!isBonPad(relatief)) throw AppError.validation("Dit is geen geldig pad van een bon.");
  const root = path.resolve(BONNEN_ROOT);
  const doel = path.resolve(root, relatief);
  if (!doel.startsWith(root + path.sep)) throw AppError.validation("Dit is geen geldig pad van een bon.");
  return doel;
}

/** Schrijft het bestand. Bestaat het al (zelfde hash = zelfde inhoud), dan blijft het zoals het is. */
export async function schrijfBonBestand(relatief: string, bytes: Buffer): Promise<{ nieuw: boolean }> {
  const doel = volledigPad(relatief);
  const bestaat = await stat(doel).then(
    () => true,
    () => false,
  );
  if (bestaat) return { nieuw: false };
  await mkdir(path.dirname(doel), { recursive: true });
  // eerst ernaast schrijven, dan hernoemen: een halve schrijfactie is nooit "het bestand"
  const tmp = `${doel}.${process.pid}.tmp`;
  await writeFile(tmp, bytes);
  await rename(tmp, doel);
  return { nieuw: true };
}

export async function leesBonBestand(relatief: string): Promise<Buffer> {
  return readFile(volledigPad(relatief));
}
