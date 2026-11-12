// ---------------------------------------------------------------------------
// Bank: vormen en hulpjes voor het scherm (puur: geen prisma, geen kv; veilig om in een clientbestand te laden).
// ---------------------------------------------------------------------------

export type TransactieStatusNaam = "NIEUW" | "GEKOPPELD" | "TWIJFEL" | "GENEGEERD";

export interface BankRekeningRij {
  id: string;
  administratieId: string;
  naam: string;
  /** "NL•• •••• •••• 4300": alleen de laatste vier tekens */
  ibanGemaskeerd: string;
  valuta: string;
  grootboekNummer: string;
  actief: boolean;
  aantalAfschriften: number;
  /** de laatste boekdag waarvoor er transacties zijn, "2026-04-10" */
  laatsteBoekdag: string | null;
}

export interface KandidaatRij {
  soort: "factuur" | "bon" | "bon-betaald" | "stripe";
  /** factuur-id of bon-id waarmee je koppelt; null bij Stripe */
  id: string | null;
  titel: string;
  zekerheid: number;
  reden: string;
}

export interface TransactieRij {
  id: string;
  bankRekeningId: string;
  boekdag: string;
  bedragCents: number;
  valuta: string;
  tegenNaam: string | null;
  tegenIbanGemaskeerd: string;
  omschrijving: string | null;
  status: TransactieStatusNaam;
  reden: string;
  kandidaten: KandidaatRij[];
  genegeerdReden: string | null;
}

export interface BankTelling {
  evenKijken: number;
  genegeerd: number;
  gekoppeld: number;
  nieuw: number;
}

export interface BankTodo {
  ernst: "blokkeert" | "let-op" | "info";
  tekst: string;
}

export interface BankOverzicht {
  rekeningen: BankRekeningRij[];
  transacties: TransactieRij[];
  /** er zijn meer transacties dan de lijst laat zien */
  afgekapt: boolean;
  telling: BankTelling;
  /** kostenrekeningen waarop een uitgave geboekt kan worden */
  categorieen: { nummer: string; naam: string }[];
  todo: BankTodo[];
}

/** Hoe zeker een voorstel is, in gewone woorden. */
export function voorstelZekerheidTekst(promille: number): string {
  if (promille >= 900) return `Heel zeker (${Math.round(promille / 10)}%)`;
  if (promille >= 700) return `Vrij zeker (${Math.round(promille / 10)}%)`;
  if (promille >= 400) return `Onzeker (${Math.round(promille / 10)}%)`;
  return `Weinig zeker (${Math.round(promille / 10)}%)`;
}

export const STATUS_TEKST: Record<TransactieStatusNaam, string> = {
  NIEUW: "Nieuw",
  TWIJFEL: "Even kijken",
  GEKOPPELD: "Gekoppeld",
  GENEGEERD: "Genegeerd",
};

/** "Wat je nog moet doen" op het tabblad Bank. */
export function bankTodo(i: { aantalRekeningen: number; telling: BankTelling; stripe: number }): BankTodo[] {
  const lijst: BankTodo[] = [];
  if (i.aantalRekeningen === 0) {
    lijst.push({ ernst: "blokkeert", tekst: "Voeg eerst een bankrekening toe en lees daarna een afschrift in." });
    return lijst;
  }
  if (i.telling.evenKijken + i.telling.nieuw > 0) {
    const n = i.telling.evenKijken + i.telling.nieuw;
    lijst.push({ ernst: "let-op", tekst: `${n} ${n === 1 ? "banktransactie wacht" : "banktransacties wachten"} op jou: koppel ze aan een factuur of bon, boek ze als kosten, of negeer ze.` });
  }
  if (i.stripe > 0) {
    lijst.push({ ernst: "info", tekst: `${i.stripe} ${i.stripe === 1 ? "transactie lijkt" : "transacties lijken"} een uitbetaling of betaling van Stripe. Stripe is nog niet aangesloten, dus die worden nog niet geboekt; laat ze staan of negeer ze.` });
  }
  if (i.telling.evenKijken + i.telling.nieuw === 0 && i.telling.gekoppeld + i.telling.genegeerd > 0) {
    lijst.push({ ernst: "info", tekst: "Alle ingelezen banktransacties zijn verwerkt." });
  }
  return lijst;
}

/** Een eenvoudige titel voor een voorstel. */
export function kandidaatTitel(k: { soort: KandidaatRij["soort"]; nummer?: string | undefined; bonLabel?: string | undefined }): string {
  if (k.soort === "factuur") return k.nummer ? `Factuur ${k.nummer}` : "Factuur";
  if (k.soort === "stripe") return "Stripe-uitbetaling (wordt nog niet geboekt)";
  const basis = k.bonLabel ?? "Bon";
  return k.soort === "bon-betaald" ? `${basis} (al betaald geboekt: alleen koppelen)` : basis;
}

export const MAX_TRANSACTIES_IN_LIJST = 200;
