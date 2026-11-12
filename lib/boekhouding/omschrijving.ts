// ---------------------------------------------------------------------------
// Boekhouding: omschrijvingen zonder persoonsgegevens (puur). In BoekBoeking/BoekRegel staat nooit een naam,
// e-mailadres, IBAN of adres: de omschrijving wordt opgebouwd uit nummers ("Factuur F-2026-0012"). De tegenpartij
// staat alleen in de wijzigbare tabellen (BoekBon, BoekBankTransactie) of in de bron zelf. De database heeft een
// vangnet (CHECK op '@' en een Nederlands IBAN); dit is de strengere controle van de applicatie.
// ---------------------------------------------------------------------------

import { AppError } from "@/lib/errors";
import type { BoekBronNaam } from "./types";

const VOORVOEGSEL: Record<BoekBronNaam, string> = {
  FACTUUR: "Factuur",
  FACTUUR_BETALING: "Betaling factuur",
  BON: "Bon",
  BANK: "Banktransactie",
  MEMORIAAL: "Memoriaal",
  OPENING: "Openingsbalans",
  TEGENBOEKING: "Tegenboeking",
};

// Letters, cijfers en . _ / - ; geen spaties en geen @: een nummer is geen vrije tekst.
const NUMMER = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,39}$/;

// Een IBAN begint met een landcode en twee cijfers (controlegetal); de lengte hangt van het land af (ISO 13616). Alleen
// de gangbare Europese landen: met een vaste lengte per land is de kans op een toevallige treffer in een nummer
// (bv. een id met letters en cijfers) verwaarloosbaar.
const IBAN_LENGTE: Record<string, number> = {
  NL: 18, BE: 16, DE: 22, FR: 27, GB: 22, IE: 22, LU: 20, ES: 24, IT: 27, PT: 25, AT: 20, CH: 21, DK: 18, SE: 24,
  NO: 15, FI: 18, PL: 28, CZ: 24, SK: 24, HU: 28, RO: 24, BG: 22, GR: 27, HR: 21, SI: 19, LT: 20, LV: 21, EE: 20,
  MT: 31, CY: 28, IS: 26, LI: 21, TR: 26, UA: 29,
};
const IBAN_START = /[A-Z]{2}\d{2}/gi;

/** Klopt het controlegetal (ISO 13616, modulo 97) van deze reeks letters/cijfers? */
function ibanControleKlopt(kandidaat: string): boolean {
  const herschikt = kandidaat.slice(4) + kandidaat.slice(0, 4);
  let rest = 0;
  for (const teken of herschikt.toUpperCase()) {
    const waarde = teken >= "A" && teken <= "Z" ? String(teken.charCodeAt(0) - 55) : teken;
    for (const cijfer of waarde) rest = (rest * 10 + Number(cijfer)) % 97;
  }
  return rest === 1;
}

function bevatIban(tekst: string): boolean {
  // Een IBAN staat vaak in groepen van vier met spaties; kijk dus naar de tekst zonder witruimte.
  const compact = tekst.replace(/\s+/g, "");
  for (const m of compact.matchAll(IBAN_START)) {
    const start = m.index ?? 0;
    const land = m[0].slice(0, 2).toUpperCase();
    const lengte = Object.hasOwn(IBAN_LENGTE, land) ? IBAN_LENGTE[land] : undefined;
    if (lengte === undefined || start + lengte > compact.length) continue;
    const kandidaat = compact.slice(start, start + lengte);
    if (/^[A-Za-z0-9]+$/.test(kandidaat) && ibanControleKlopt(kandidaat)) return true;
  }
  return false;
}

/**
 * Staat er een e-mailadres of IBAN (met geldig controlegetal) in de tekst? Namen en adressen zijn in vrije tekst niet
 * te herkennen: daarom bouwen we omschrijvingen uit nummers en dit is het vangnet.
 */
export function bevatPersoonsgegevens(tekst: string): boolean {
  return tekst.includes("@") || bevatIban(tekst);
}

/** Weigert tekst met een e-mailadres of IBAN, met een duidelijke Nederlandse fout. */
export function controleerGeenPersoonsgegevens(tekst: string, veld: string): void {
  if (bevatPersoonsgegevens(tekst)) {
    throw AppError.validation(
      `${veld} bevat een e-mailadres of IBAN. In de boekhouding staan geen persoonsgegevens: gebruik een nummer, zoals "Factuur F-2026-0012".`,
    );
  }
}

/**
 * De omschrijving van een boeking, opgebouwd uit het soort bron en een nummer:
 * omschrijvingVoor("FACTUUR", "F-2026-0012") = "Factuur F-2026-0012".
 */
export function omschrijvingVoor(bron: BoekBronNaam, nummer: string | number): string {
  const tekst = String(nummer).trim();
  if (!NUMMER.test(tekst)) {
    throw AppError.validation(
      "Een omschrijving wordt opgebouwd uit een nummer (letters, cijfers, punt, streepje, schuine streep), niet uit vrije tekst.",
    );
  }
  const omschrijving = `${VOORVOEGSEL[bron]} ${tekst}`;
  controleerGeenPersoonsgegevens(omschrijving, "Het nummer");
  return omschrijving;
}
