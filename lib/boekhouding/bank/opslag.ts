// ---------------------------------------------------------------------------
// Bank: het afschriftbestand op het opslagvolume (storage/boekhouding/bank/...), nooit in public/. Zeven jaar bewaren
// (bewaarplicht; termijn door de accountant te bevestigen). Er is bewust geen verwijderfunctie. Het bestand bevat
// persoonsgegevens van tegenpartijen: het hoort bij de administratie van het platform en wordt nooit teruggegeven aan klanten.
// ---------------------------------------------------------------------------

import path from "node:path";
import { mkdir, rename, stat, writeFile } from "node:fs/promises";
import { AppError } from "@/lib/errors";
import { BONNEN_ROOT } from "../bonnen/opslag";

const ADMINISTRATIE_ID = /^[A-Za-z0-9_-]{6,64}$/;
const SHA256 = /^[0-9a-f]{64}$/;

/** boekhouding/bank/<administratie>/<ab>/<sha>.<ext>, relatief aan storage/. */
export function bankBestandPad(administratieId: string, sha256: string, ext: "xml" | "csv"): string {
  if (!ADMINISTRATIE_ID.test(administratieId)) throw AppError.validation("Dit is geen geldig administratienummer.");
  if (!SHA256.test(sha256)) throw AppError.validation("Dit is geen geldige bestandshash.");
  return `boekhouding/bank/${administratieId}/${sha256.slice(0, 2)}/${sha256}.${ext}`;
}

export function isBankPad(pad: string): boolean {
  return /^boekhouding\/bank\/[A-Za-z0-9_-]{6,64}\/[0-9a-f]{2}\/[0-9a-f]{64}\.(xml|csv)$/.test(pad);
}

/** Schrijft het bestand; bestaat het al (zelfde hash = zelfde inhoud), dan blijft het zoals het is. */
export async function schrijfBankBestand(relatief: string, bytes: Uint8Array): Promise<{ nieuw: boolean }> {
  if (!isBankPad(relatief)) throw AppError.validation("Dit is geen geldig pad van een bankafschrift.");
  const root = path.resolve(BONNEN_ROOT);
  const doel = path.resolve(root, relatief);
  if (!doel.startsWith(root + path.sep)) throw AppError.validation("Dit is geen geldig pad van een bankafschrift.");
  const bestaat = await stat(doel).then(
    () => true,
    () => false,
  );
  if (bestaat) return { nieuw: false };
  await mkdir(path.dirname(doel), { recursive: true });
  const tmp = `${doel}.${process.pid}.tmp`;
  await writeFile(tmp, bytes);
  await rename(tmp, doel);
  return { nieuw: true };
}
