import { isValidIban } from "@/lib/billing/sepa";

// Betalen per bankoverschrijving (14 nov 2026): zolang het Stripe-account dicht staat (en ook daarna als alternatief) kan een factuur
// van ZekerFlex per overschrijving worden betaald. De factuur toont de rekening van ZekerFlex, het bedrag en het factuurnummer als
// betalingskenmerk; het afletteren (lib/boekhouding/bank/matching-kern.ts) herkent dat factuurnummer in de omschrijving op het
// bankafschrift. Puur: de rekeninggegevens komen uit de bestaande instelling (SEPA_CREDITOR_IBAN en SEPA_CREDITOR_NAME, zie de
// eigenaar-taak "sepa") en worden NOOIT verzonnen: ontbreken ze of is het IBAN ongeldig, dan is er geen overschrijving om te tonen.

export interface Overschrijving {
  /** de rekeninghouder zoals de bank hem kent */
  naam: string;
  /** zonder spaties, hoofdletters */
  iban: string;
  /** in groepen van vier, om over te typen */
  ibanLeesbaar: string;
  /** het factuurnummer: wat de betaler in de omschrijving zet */
  kenmerk: string;
  bedragCents: number;
}

export function ibanLeesbaar(iban: string): string {
  return iban.replace(/\s+/g, "").toUpperCase().replace(/(.{4})/g, "$1 ").trim();
}

/** Een euro-bedrag zoals op de factuur: "EUR 1.234,50" is voor de pdf, deze is voor het scherm. */
export function bedragTekst(cents: number): string {
  return `€ ${(cents / 100).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * De gegevens om over te maken, of null als dat niet kan: geen of ongeldig IBAN, geen rekeninghouder, geen bedrag, een factuur die niet
 * (meer) open staat, of een factuur die niet aan ZekerFlex betaald wordt (een factuur van een zzp'er, self-billing).
 */
export function overschrijvingVoor(i: {
  iban: string | null | undefined;
  naam: string | null | undefined;
  factuurnummer: string;
  totaalCents: number;
  status: string;
  betaaltAanPlatform: boolean;
}): Overschrijving | null {
  const iban = (i.iban ?? "").replace(/\s+/g, "").toUpperCase();
  const naam = (i.naam ?? "").trim();
  if (!iban || !naam || !i.factuurnummer || !isValidIban(iban)) return null;
  if (!i.betaaltAanPlatform || i.status !== "ISSUED" || !Number.isFinite(i.totaalCents) || i.totaalCents <= 0) return null;
  return { naam, iban, ibanLeesbaar: ibanLeesbaar(iban), kenmerk: i.factuurnummer, bedragCents: i.totaalCents };
}

/**
 * Wat de betaler te lezen krijgt, op de pdf en op de betaalpagina. Eerlijk: er is geen koppeling met de bank die een betaling
 * vanzelf herkent; iemand ziet de betaling op de rekening en zet de factuur dan op betaald.
 */
export const OVERSCHRIJVING_UITLEG: readonly string[] = [
  "Zet het factuurnummer bij de omschrijving.",
  "Zodra wij je betaling op onze rekening zien, koppelen we hem aan deze factuur en zetten we de factuur op betaald.",
  "Dat kan een of twee werkdagen duren.",
];

/** De regels voor de pdf (platte tekst). */
export function overschrijvingRegels(o: Overschrijving): string[] {
  return [
    `Rekeninghouder: ${o.naam}`,
    `IBAN: ${o.ibanLeesbaar}`,
    `Bedrag: EUR ${(o.bedragCents / 100).toFixed(2).replace(".", ",")}`,
    `Betalingskenmerk: ${o.kenmerk}`,
    ...OVERSCHRIJVING_UITLEG,
  ];
}

/** Wat de factuur over online betalen mag zeggen: alleen als Stripe echt betaalt. */
export type OnlineStand = "open" | "dicht";