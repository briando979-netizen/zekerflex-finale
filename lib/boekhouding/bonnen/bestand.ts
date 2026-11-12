// ---------------------------------------------------------------------------
// Bonnen: het bestand zelf (puur, zonder prisma of schijf). Een bon is een pdf of foto (jpg, png, heic) van hooguit
// 15 MB. We vertrouwen de bestandsnaam niet: het type komt uit de eerste bytes (magic bytes). De bestandsnaam op
// schijf is de sha-256 van de inhoud: dezelfde bon twee keer uploaden geeft dezelfde naam en wordt herkend.
// ---------------------------------------------------------------------------

import { createHash } from "node:crypto";
import { AppError } from "@/lib/errors";

export const BON_MAX_BYTES = 15 * 1024 * 1024;

export type BonExtensie = "pdf" | "jpg" | "png" | "heic";

export interface BonType {
  mimeType: string;
  ext: BonExtensie;
}

const TYPES: Record<BonExtensie, BonType> = {
  pdf: { mimeType: "application/pdf", ext: "pdf" },
  jpg: { mimeType: "image/jpeg", ext: "jpg" },
  png: { mimeType: "image/png", ext: "png" },
  heic: { mimeType: "image/heic", ext: "heic" },
};

// Merken (bytes 8-11 na "ftyp") van een HEIC/HEIF-bestand.
const HEIC_MERKEN = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"]);

/** Het type volgens de eerste bytes, of null als het geen pdf, jpg, png of heic is. */
export function herkenBonType(bytes: Buffer): BonType | null {
  if (bytes.length >= 5 && bytes.subarray(0, 5).toString("latin1") === "%PDF-") return TYPES.pdf;
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return TYPES.jpg;
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return TYPES.png;
  }
  if (bytes.length >= 12 && bytes.subarray(4, 8).toString("latin1") === "ftyp") {
    if (HEIC_MERKEN.has(bytes.subarray(8, 12).toString("latin1").toLowerCase())) return TYPES.heic;
  }
  return null;
}

/** De extensie die een bestandsnaam beweert (kleine letters, zonder punt), of null. */
function beweerdeExtensie(naam: string): string | null {
  const m = /\.([A-Za-z0-9]{1,5})$/.exec(naam.trim());
  return m ? m[1]!.toLowerCase() : null;
}

const EXTENSIE_GROEP: Record<string, BonExtensie> = { pdf: "pdf", jpg: "jpg", jpeg: "jpg", png: "png", heic: "heic", heif: "heic" };

export interface GeldigBonBestand extends BonType {
  sha256: string;
  bytes: number;
}

export function sha256Hex(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Controleert een bonbestand: niet leeg, hooguit 15 MB, een echt pdf/jpg/png/heic volgens de bytes, en (als een
 * bestandsnaam is meegegeven) een extensie die daarbij past. Gooit AppError.validation met een Nederlandse tekst.
 */
export function valideerBonBestand(bytes: Buffer, bestandsnaam?: string): GeldigBonBestand {
  if (bytes.length === 0) throw AppError.validation("Het bestand is leeg.");
  if (bytes.length > BON_MAX_BYTES) {
    throw AppError.validation("Het bestand is groter dan 15 MB. Maak een kleinere foto of pdf.");
  }
  const type = herkenBonType(bytes);
  if (!type) {
    throw AppError.validation("Dit bestand is geen pdf, jpg, png of heic. Alleen die vier soorten kunnen als bon worden bewaard.");
  }
  if (bestandsnaam) {
    const beweerd = beweerdeExtensie(bestandsnaam);
    if (beweerd !== null) {
      const groep = Object.hasOwn(EXTENSIE_GROEP, beweerd) ? EXTENSIE_GROEP[beweerd] : undefined;
      if (groep !== type.ext) {
        throw AppError.validation("De extensie van het bestand past niet bij wat erin zit. Upload het originele bestand.");
      }
    }
  }
  return { ...type, sha256: sha256Hex(bytes), bytes: bytes.length };
}

const ADMINISTRATIE_ID = /^[A-Za-z0-9_-]{6,64}$/;
const SHA256 = /^[0-9a-f]{64}$/;

/**
 * Het pad van een bon, relatief aan storage/ (het opslagvolume; nooit public/): boekhouding/bonnen/<administratie>/<ab>/<sha>.<ext>.
 * De eerste twee tekens van de hash zijn een tussenmap, zodat een map niet duizenden bestanden krijgt.
 */
export function bonBestandPad(administratieId: string, sha256: string, ext: BonExtensie): string {
  if (!ADMINISTRATIE_ID.test(administratieId)) throw AppError.validation("Dit is geen geldig administratienummer.");
  if (!SHA256.test(sha256)) throw AppError.validation("Dit is geen geldige bestandshash.");
  if (!Object.hasOwn(TYPES, ext)) throw AppError.validation("Onbekend bestandstype.");
  return `boekhouding/bonnen/${administratieId}/${sha256.slice(0, 2)}/${sha256}.${ext}`;
}

/** Het bewaarpad moet altijd binnen boekhouding/bonnen/ vallen: nooit een pad uit de database blind openen. */
export function isBonPad(pad: string): boolean {
  return /^boekhouding\/bonnen\/[A-Za-z0-9_-]{6,64}\/[0-9a-f]{2}\/[0-9a-f]{64}\.(pdf|jpg|png|heic)$/.test(pad);
}

/**
 * Bewaarplicht: een bon blijft tot 31 december van het zevende jaar na het uploadjaar bewaard. DOOR ACCOUNTANT TE
 * BEVESTIGEN (de wet kent voor sommige stukken langere termijnen); liever te lang dan te kort.
 */
export const BEWAARTERMIJN_JAREN = 7;

export function bewaarTotVoor(uploadDag: string): Date {
  const jaar = Number(uploadDag.slice(0, 4));
  return new Date(Date.UTC(jaar + BEWAARTERMIJN_JAREN, 11, 31));
}
