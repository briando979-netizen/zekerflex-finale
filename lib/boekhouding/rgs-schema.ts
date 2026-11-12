// ---------------------------------------------------------------------------
// Boekhouding: bescheiden basisrekeningschema voor een kleine onderneming (zoals Zekerflex, Inc.). Puur: alleen gegevens.
//
// DOOR ACCOUNTANT TE BEVESTIGEN: de hele indeling. Dit is een werkbaar startpunt, geen vastgesteld stelsel.
// Het nummeren is onze eigen (4 cijfers, kopjes met 1-2 cijfers). De koppeling met het Referentiegrootboekschema (RGS)
// is bewust nog leeg: `rgsCode` blijft null tot de accountant per rekening de juiste RGS-code heeft bevestigd. We
// verzinnen geen RGS-codes; een foute code in een aangifte of XAF-export is erger dan een lege.
// ---------------------------------------------------------------------------

import type { BtwCodeSjabloon, RekeningSjabloon } from "./rgs-types";

export const BASIS_REKENINGSCHEMA: readonly RekeningSjabloon[] = [
  // Vlottende activa
  { nummer: "1", naam: "Vlottende activa", soort: "ACTIVA", boekbaar: false },
  { nummer: "1100", naam: "Bank", soort: "ACTIVA", ouder: "1", boekbaar: true },
  { nummer: "1150", naam: "Stripe-saldo (nog uit te betalen)", soort: "ACTIVA", ouder: "1", boekbaar: true },
  { nummer: "1200", naam: "Debiteuren", soort: "ACTIVA", ouder: "1", boekbaar: true },
  { nummer: "1300", naam: "Te vorderen btw (voorbelasting)", soort: "ACTIVA", ouder: "1", boekbaar: true },
  { nummer: "1400", naam: "Overige vorderingen en vooruitbetaalde kosten", soort: "ACTIVA", ouder: "1", boekbaar: true },

  // Eigen vermogen
  { nummer: "20", naam: "Eigen vermogen", soort: "PASSIVA", boekbaar: false },
  { nummer: "2010", naam: "Geplaatst kapitaal", soort: "PASSIVA", ouder: "20", boekbaar: true },
  { nummer: "2020", naam: "Overige reserves", soort: "PASSIVA", ouder: "20", boekbaar: true },
  { nummer: "2030", naam: "Onverdeeld resultaat", soort: "PASSIVA", ouder: "20", boekbaar: true },

  // Kortlopende schulden
  { nummer: "22", naam: "Kortlopende schulden", soort: "PASSIVA", boekbaar: false },
  { nummer: "2200", naam: "Crediteuren", soort: "PASSIVA", ouder: "22", boekbaar: true },
  { nummer: "2300", naam: "Te betalen btw", soort: "PASSIVA", ouder: "22", boekbaar: true },
  { nummer: "2400", naam: "Overige schulden en overlopende passiva", soort: "PASSIVA", ouder: "22", boekbaar: true },
  { nummer: "2900", naam: "Kruisposten (tussenrekening, moet op nul eindigen)", soort: "PASSIVA", ouder: "22", boekbaar: true },

  // Kosten
  { nummer: "4", naam: "Kosten", soort: "KOSTEN", boekbaar: false },
  { nummer: "4000", naam: "Hosting en infrastructuur", soort: "KOSTEN", ouder: "4", boekbaar: true },
  { nummer: "4100", naam: "Software en abonnementen", soort: "KOSTEN", ouder: "4", boekbaar: true },
  { nummer: "4200", naam: "Betaalkosten (Stripe)", soort: "KOSTEN", ouder: "4", boekbaar: true },
  { nummer: "4300", naam: "Marketing en reclame", soort: "KOSTEN", ouder: "4", boekbaar: true },
  { nummer: "4400", naam: "Advies- en accountantskosten", soort: "KOSTEN", ouder: "4", boekbaar: true },
  { nummer: "4500", naam: "Verzekeringen", soort: "KOSTEN", ouder: "4", boekbaar: true },
  { nummer: "4600", naam: "Reis- en verblijfkosten", soort: "KOSTEN", ouder: "4", boekbaar: true },
  { nummer: "4700", naam: "Kantoorkosten", soort: "KOSTEN", ouder: "4", boekbaar: true },
  { nummer: "4800", naam: "Bankkosten", soort: "KOSTEN", ouder: "4", boekbaar: true },
  { nummer: "4850", naam: "Koersverschillen", soort: "KOSTEN", ouder: "4", boekbaar: true },
  { nummer: "4900", naam: "Overige kosten", soort: "KOSTEN", ouder: "4", boekbaar: true },

  // Omzet
  { nummer: "8", naam: "Omzet", soort: "OMZET", boekbaar: false },
  { nummer: "8000", naam: "Omzet platformfee", soort: "OMZET", ouder: "8", boekbaar: true },
  { nummer: "8100", naam: "Omzet uitzendfee", soort: "OMZET", ouder: "8", boekbaar: true },
  { nummer: "8200", naam: "Omzet domeinen", soort: "OMZET", ouder: "8", boekbaar: true },
  { nummer: "8900", naam: "Overige opbrengsten", soort: "OMZET", ouder: "8", boekbaar: true },
];

// Nederlandse btw-codes. DOOR ACCOUNTANT TE BEVESTIGEN: of een Amerikaanse Inc. btw-plichtig is, en de rubrieken van de
// aangifte (1a hoog tarief, 1b laag tarief, 1e 0%/vrijgesteld, 5b voorbelasting). Tarieven in basispunten.
export const BASIS_BTW_CODES: readonly BtwCodeSjabloon[] = [
  { code: "NL21-V", omschrijving: "Verkoop 21%", richting: "VERKOOP", tariefBasispunten: 2100, grondslagRubriek: "1a", btwRubriek: "1a" },
  { code: "NL09-V", omschrijving: "Verkoop 9%", richting: "VERKOOP", tariefBasispunten: 900, grondslagRubriek: "1b", btwRubriek: "1b" },
  { code: "NL00-V", omschrijving: "Verkoop 0% of vrijgesteld", richting: "VERKOOP", tariefBasispunten: 0, grondslagRubriek: "1e", btwRubriek: null },
  { code: "NL21-I", omschrijving: "Inkoop 21%", richting: "INKOOP", tariefBasispunten: 2100, grondslagRubriek: null, btwRubriek: "5b" },
  { code: "NL09-I", omschrijving: "Inkoop 9%", richting: "INKOOP", tariefBasispunten: 900, grondslagRubriek: null, btwRubriek: "5b" },
  { code: "NL00-I", omschrijving: "Inkoop 0% of zonder btw", richting: "INKOOP", tariefBasispunten: 0, grondslagRubriek: null, btwRubriek: null },
];

/** De 21%- en 9%-tarieven gelden sinds 1 januari 2019; zo ver terug is er geen code nodig. */
export const BTW_CODES_GELDIG_VANAF = "2019-01-01";
