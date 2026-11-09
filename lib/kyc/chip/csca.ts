// ---------------------------------------------------------------------------
// De vertrouwde overheidscertificaten (CSCA, Country Signing CA): het begin van
// de keten waarmee een chip echt bevonden wordt (lib/kyc/chip/sod.ts). Ze staan
// als bestanden op het opslagvolume (storage/csca, of CSCA_DIR): PEM (ook
// meerdere in één bestand) of DER. Een overheid publiceert ze zelf; de eigenaar
// zet ze er één keer neer (lib/admin/owner-todos.ts, "chip-csca"). Zonder CSCA
// van een land is de keten "niet gecontroleerd" (null), nooit "echt".
// Gedeeld via globalThis (Next bundelt routes apart), vijf minuten bewaard.
// ---------------------------------------------------------------------------

import path from "node:path";
import { readdir, readFile } from "node:fs/promises";
import { X509Certificate } from "node:crypto";
import { logger } from "@/lib/logger";
import { landVan } from "@/lib/kyc/chip/sod";

export const CSCA_DIR = process.env.CSCA_DIR || path.join(process.cwd(), "storage", "csca");
const BEWAAR_MS = 5 * 60_000;

const g = globalThis as unknown as { __zfCsca?: { op: number; certs: X509Certificate[] } };

/** Haalt alle certificaten uit één bestand (PEM met een of meer blokken, of één DER). */
export function certificatenUit(bytes: Buffer): X509Certificate[] {
  const tekst = bytes.toString("latin1");
  if (tekst.includes("-----BEGIN CERTIFICATE-----")) {
    const blokken = tekst.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? [];
    return blokken.map((b) => new X509Certificate(b));
  }
  return [new X509Certificate(bytes)];
}

export async function laadCsca(): Promise<X509Certificate[]> {
  const nu = Date.now();
  if (g.__zfCsca && nu - g.__zfCsca.op < BEWAAR_MS) return g.__zfCsca.certs;
  const certs: X509Certificate[] = [];
  let namen: string[] = [];
  try {
    namen = await readdir(CSCA_DIR);
  } catch {
    // map bestaat (nog) niet: geen CSCA's, de keten blijft "niet gecontroleerd"
  }
  for (const naam of namen) {
    if (!/\.(pem|crt|cer|der)$/i.test(naam)) continue;
    try {
      certs.push(...certificatenUit(await readFile(path.join(CSCA_DIR, naam))));
    } catch (err) {
      logger.warn("csca-bestand onleesbaar", { bestand: naam, error: (err as Error).message });
    }
  }
  g.__zfCsca = { op: nu, certs };
  return certs;
}

/** Voor beheer: hoeveel CSCA's er zijn en van welke landen. */
export async function cscaStand(): Promise<{ map: string; aantal: number; landen: string[] }> {
  const certs = await laadCsca();
  const landen = [...new Set(certs.map(landVan).filter((l): l is string => Boolean(l)))].sort();
  return { map: CSCA_DIR, aantal: certs.length, landen };
}
