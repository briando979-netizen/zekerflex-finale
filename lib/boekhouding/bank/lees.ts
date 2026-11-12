// ---------------------------------------------------------------------------
// Bank: een afschriftbestand inlezen (puur): grootte, tekencodering, formaat herkennen, aantallen, en de unieke sleutel
// per transactie voor het idempotent importeren.
// ---------------------------------------------------------------------------

import { createHash } from "node:crypto";
import { AppError } from "@/lib/errors";
import { leesCamt053, lijktOpCamt } from "./camt053";
import { leesCsvAfschrift } from "./csv";
import { bytesNaarTekst } from "./tekst";
import { BANK_MAX_BYTES, BANK_MAX_TRANSACTIES, type BankAfschriftData, type BankRegel } from "./types";

/**
 * Leest een bankafschrift (CAMT.053 of csv). Gooit AppError.validation met een Nederlandse tekst bij een leeg, te groot
 * of onbekend bestand. MT940 lezen we niet (zie de melding).
 */
export function leesBankBestand(bytes: Uint8Array): BankAfschriftData {
  if (bytes.length === 0) throw AppError.validation("Het bestand is leeg.");
  if (bytes.length > BANK_MAX_BYTES) throw AppError.validation("Het bestand is groter dan 5 MB. Exporteer een kortere periode.");
  const tekst = bytesNaarTekst(bytes);
  if (tekst.includes("\u0000")) throw AppError.validation("Dit lijkt geen tekstbestand (CAMT.053-xml of csv). Upload het afschrift zoals de bank het geeft.");

  const begin = tekst.slice(0, 4000);
  let uit: BankAfschriftData;
  if (lijktOpCamt(tekst)) uit = leesCamt053(tekst);
  else if (/^\s*:20:/m.test(begin) || (/:61:/.test(tekst) && /:60[FM]:/.test(tekst))) {
    throw AppError.validation("Dit is een MT940-bestand. Die lezen we nog niet: exporteer het afschrift als CAMT.053 (xml) of als csv.");
  } else if (/^\s*<\?xml|^\s*</.test(begin)) {
    throw AppError.validation("Formaat niet herkend: dit is een xml-bestand, maar geen CAMT.053-bankafschrift.");
  } else uit = leesCsvAfschrift(tekst);

  if (uit.transacties.length === 0) throw AppError.validation("Het afschrift bevat geen transacties.");
  if (uit.transacties.length > BANK_MAX_TRANSACTIES) {
    throw AppError.validation(`Het afschrift bevat meer dan ${String(BANK_MAX_TRANSACTIES).replace(/\B(?=(\d{3})+(?!\d))/g, ".")} transacties. Exporteer een kortere periode.`);
  }
  return uit;
}

export const sha256Bytes = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

/**
 * De unieke sleutel van elke transactie (zelfde volgorde als de invoer), per bankrekening:
 *  - heeft de bank een eigen referentie: "ref:<referentie>";
 *  - anders sha-256 van rekening|dag|bedrag|tegen-IBAN|omschrijving|n, waarbij n telt hoeveel keer EXACT dezelfde regel
 *    al eerder in het bestand stond (0 voor de eerste). Zo blijft een tweede, gelijke betaling op dezelfde dag bestaan,
 *    en krijgt dezelfde transactie in een overlappend afschrift dezelfde sleutel (de plaats in het bestand telt niet mee).
 * Valt een referentie twee keer in één bestand, dan krijgt de tweede "#1", enzovoort.
 */
export function dedupeSleutels(rekeningIban: string, regels: readonly BankRegel[]): string[] {
  const gezien = new Map<string, number>();
  return regels.map((r) => {
    if (r.bankReferentie) {
      const basis = `ref:${r.bankReferentie}`;
      const n = gezien.get(basis) ?? 0;
      gezien.set(basis, n + 1);
      return n === 0 ? basis : `${basis}#${n}`;
    }
    const basis = [rekeningIban, r.boekdag, r.bedragCents, r.tegenIban ?? "", (r.omschrijving ?? "").toLowerCase()].join("|");
    const n = gezien.get(basis) ?? 0;
    gezien.set(basis, n + 1);
    return `hash:${createHash("sha256").update(`${basis}|${n}`).digest("hex")}`;
  });
}

/** De bestandsextensie waaronder het afschrift wordt bewaard. */
export function bestandExtensie(data: Pick<BankAfschriftData, "formaat">): "xml" | "csv" {
  return data.formaat === "CAMT053" ? "xml" : "csv";
}
