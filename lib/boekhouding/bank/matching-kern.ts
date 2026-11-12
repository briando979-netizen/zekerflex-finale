// ---------------------------------------------------------------------------
// Bank: een banktransactie koppelen aan een factuur of bon (puur, zonder prisma). Per transactie komen er voorstellen
// met een zekerheid (0-1000) en een reden. ALLEEN bij een exact factuurnummer in de omschrijving, een exact bedrag en
// precies één kandidaat wordt er vanzelf geboekt; al het andere blijft "even kijken" met het voorstel erbij.
// In een voorstel staan alleen id's, nummers en bedragen: nooit een naam of IBAN.
// ---------------------------------------------------------------------------

export type Voorstel =
  | { soort: "factuur"; invoiceId: string; nummer: string; openCents: number }
  | { soort: "bon"; bonId: string; openCents: number }
  /** een bon die al "met de bank betaald" is geboekt: alleen koppelen, niet nog eens boeken */
  | { soort: "bon-betaald"; bonId: string; boekingId: string }
  | { soort: "stripe" };

export interface Kandidaat {
  voorstel: Voorstel;
  /** 0-1000 */
  zekerheid: number;
  reden: string;
  /** stond het exacte factuurnummer in de omschrijving? */
  nummerGevonden: boolean;
}

export interface TransactieKern {
  bedragCents: number;
  boekdag: string;
  tegenIban: string | null;
  tegenNaam: string | null;
  omschrijving: string | null;
}

export interface OpenFactuur {
  invoiceId: string;
  nummer: string;
  openCents: number;
  /** tegenrekeningen van eerdere betalingen van dezelfde klant */
  bekendeIbans: readonly string[];
}

export interface OpenBon {
  bonId: string;
  openCents: number;
  leverancier: string | null;
  leverancierNummer: string | null;
  bonDatum: string | null;
}

export interface BetaaldeBon {
  bonId: string;
  boekingId: string;
  totaalCents: number;
  leverancier: string | null;
  leverancierNummer: string | null;
  bonDatum: string | null;
}

export interface MatchContext {
  facturen: readonly OpenFactuur[];
  bonnen: readonly OpenBon[];
  betaaldeBonnen: readonly BetaaldeBon[];
}

export type Actie = "boek" | "koppel" | "even-kijken";

export interface Beslissing {
  actie: Actie;
  gekozen: Kandidaat | null;
  /** de beste kandidaten, hoogste zekerheid eerst (hooguit 5) */
  kandidaten: Kandidaat[];
  /** waarom dit even kijken is, of wat er gekozen is */
  reden: string;
}

export const MAX_KANDIDATEN = 5;
/** Een nummer korter dan dit (alleen letters en cijfers) is te algemeen om er een factuur aan te koppelen. */
const MIN_NUMMER_TEKENS = 5;

function tokens(tekst: string): string[] {
  return tekst
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
}

/**
 * Staat dit nummer (bv. "F-2026-0012") in de tekst? Spaties en streepjes mogen anders staan ("F 2026 0012", "F20260012"),
 * maar het nummer moet uit hele woorden bestaan: "F-2026-00123" telt niet voor "F-2026-0012".
 */
export function nummerInTekst(tekst: string | null, nummer: string | null): boolean {
  if (!tekst || !nummer) return false;
  const doel = tokens(nummer).join("");
  if (doel.length < MIN_NUMMER_TEKENS) return false;
  const woorden = tokens(tekst);
  for (let i = 0; i < woorden.length; i += 1) {
    let samen = "";
    for (let j = i; j < woorden.length && samen.length < doel.length; j += 1) {
      samen += woorden[j];
      if (samen === doel) return true;
    }
  }
  return false;
}

const STOPWOORDEN = new Set(["BV", "NV", "VOF", "INC", "LLC", "LTD", "GMBH", "THE", "DE", "HET", "EEN", "VAN", "EN", "STICHTING", "NEDERLAND", "NL", "BANK", "OVERBOEKING", "BETALING", "FACTUUR", "SEPA", "IDEAL", "NAAM", "OMSCHRIJVING", "KENMERK"]);

function significanteWoorden(tekst: string | null): Set<string> {
  return new Set(tokens(tekst ?? "").filter((w) => w.length >= 3 && !STOPWOORDEN.has(w) && !/^\d+$/.test(w)));
}

/** Delen de twee namen minstens één betekenisvol woord (zonder bv, nv, inc)? */
export function naamOvereenkomst(a: string | null, b: string | null): boolean {
  const woordenB = significanteWoorden(b);
  if (woordenB.size === 0) return false;
  for (const w of significanteWoorden(a)) if (woordenB.has(w)) return true;
  return false;
}

function dagNummer(dag: string): number {
  return Date.UTC(Number(dag.slice(0, 4)), Number(dag.slice(5, 7)) - 1, Number(dag.slice(8, 10))) / 86_400_000;
}

/** Past de betaaldag bij de bondatum: niet eerder dan 3 dagen ervoor en hooguit 120 dagen erna. */
export function datumPast(bonDatum: string | null, betaaldag: string): boolean {
  if (!bonDatum) return false;
  const verschil = dagNummer(betaaldag) - dagNummer(bonDatum);
  return verschil >= -3 && verschil <= 120;
}

const heeftStripe = (t: TransactieKern): boolean => tokens(`${t.tegenNaam ?? ""} ${t.omschrijving ?? ""}`).includes("STRIPE");

function sorteer(kandidaten: Kandidaat[]): Kandidaat[] {
  return [...kandidaten].sort((a, b) => b.zekerheid - a.zekerheid);
}

function kandidatenOntvangen(t: TransactieKern, ctx: MatchContext): Kandidaat[] {
  const tekst = `${t.omschrijving ?? ""} ${t.tegenNaam ?? ""}`;
  const uit: Kandidaat[] = [];
  for (const f of ctx.facturen) {
    const nummer = nummerInTekst(tekst, f.nummer);
    const exact = f.openCents === t.bedragCents;
    const ibanBekend = t.tegenIban !== null && f.bekendeIbans.includes(t.tegenIban);
    const voorstel: Voorstel = { soort: "factuur", invoiceId: f.invoiceId, nummer: f.nummer, openCents: f.openCents };
    if (nummer && exact) {
      uit.push({ voorstel, zekerheid: 1000, nummerGevonden: true, reden: `Factuurnummer ${f.nummer} staat in de omschrijving en het bedrag klopt precies.` });
    } else if (nummer) {
      const reden =
        t.bedragCents < f.openCents
          ? `Factuurnummer ${f.nummer} staat in de omschrijving, maar het bedrag is lager dan wat openstaat (mogelijk een deelbetaling).`
          : `Factuurnummer ${f.nummer} staat in de omschrijving, maar het bedrag is hoger dan wat openstaat.`;
      uit.push({ voorstel, zekerheid: t.bedragCents < f.openCents ? 700 : 600, nummerGevonden: true, reden });
    } else if (exact) {
      uit.push({
        voorstel,
        zekerheid: ibanBekend ? 750 : 400,
        nummerGevonden: false,
        reden: ibanBekend
          ? `Het bedrag klopt precies met factuur ${f.nummer} en de tegenrekening heeft eerder voor deze klant betaald, maar het factuurnummer staat er niet bij.`
          : `Het bedrag klopt precies met factuur ${f.nummer}, maar het factuurnummer staat er niet bij.`,
      });
    }
  }
  return uit;
}

function kandidatenBetaald(t: TransactieKern, ctx: MatchContext): Kandidaat[] {
  const bedrag = Math.abs(t.bedragCents);
  const tekst = `${t.omschrijving ?? ""} ${t.tegenNaam ?? ""}`;
  const uit: Kandidaat[] = [];
  const beoordeel = (
    bon: { bonId: string; leverancier: string | null; leverancierNummer: string | null; bonDatum: string | null },
    bedragBon: number,
    voorstel: Voorstel,
  ): void => {
    const nummer = nummerInTekst(tekst, bon.leverancierNummer);
    const exact = bedragBon === bedrag;
    const naam = naamOvereenkomst(t.tegenNaam, bon.leverancier);
    const datum = datumPast(bon.bonDatum, t.boekdag);
    if (nummer && exact) {
      uit.push({ voorstel, zekerheid: 1000, nummerGevonden: true, reden: "Het factuurnummer van de bon staat in de omschrijving en het bedrag klopt precies." });
    } else if (nummer) {
      uit.push({ voorstel, zekerheid: 650, nummerGevonden: true, reden: "Het factuurnummer van de bon staat in de omschrijving, maar het bedrag wijkt af." });
    } else if (exact && naam && datum) {
      uit.push({ voorstel, zekerheid: 900, nummerGevonden: false, reden: "Het bedrag klopt precies, de naam van de leverancier komt overeen en de datum past." });
    } else if (exact && naam) {
      uit.push({ voorstel, zekerheid: 800, nummerGevonden: false, reden: "Het bedrag klopt precies en de naam van de leverancier komt overeen; de datum past niet goed." });
    } else if (exact && datum) {
      uit.push({ voorstel, zekerheid: 600, nummerGevonden: false, reden: "Het bedrag klopt precies en de datum past, maar de leverancier is niet te herkennen." });
    } else if (exact) {
      uit.push({ voorstel, zekerheid: 300, nummerGevonden: false, reden: "Het bedrag klopt precies, maar de datum past niet en de leverancier is niet te herkennen." });
    }
  };
  for (const b of ctx.bonnen) beoordeel(b, b.openCents, { soort: "bon", bonId: b.bonId, openCents: b.openCents });
  for (const b of ctx.betaaldeBonnen) beoordeel(b, b.totaalCents, { soort: "bon-betaald", bonId: b.bonId, boekingId: b.boekingId });
  return uit;
}

/**
 * De beslissing voor één banktransactie. `boek`: vanzelf boeken (alleen bij exact factuurnummer + exact bedrag + één
 * kandidaat); `koppel`: hetzelfde, maar de bon is al boekhoudkundig betaald, dus alleen koppelen; anders `even-kijken`.
 */
export function beslis(t: TransactieKern, ctx: MatchContext): Beslissing {
  if (t.bedragCents === 0) return { actie: "even-kijken", gekozen: null, kandidaten: [], reden: "Een transactie van nul euro is niets om te boeken." };
  const ontvangen = t.bedragCents > 0;
  const alle = sorteer(ontvangen ? kandidatenOntvangen(t, ctx) : kandidatenBetaald(t, ctx));

  const stripe = heeftStripe(t);
  if (stripe) {
    const reden = ontvangen
      ? "Dit lijkt een uitbetaling van Stripe. Stripe is nog niet aangesloten, dus dit wordt nog niet geboekt."
      : "Dit lijkt een betaling aan Stripe. Stripe is nog niet aangesloten, dus dit wordt nog niet geboekt.";
    const kandidaten = [{ voorstel: { soort: "stripe" } as Voorstel, zekerheid: 900, nummerGevonden: false, reden }, ...alle].slice(0, MAX_KANDIDATEN);
    return { actie: "even-kijken", gekozen: kandidaten[0] ?? null, kandidaten, reden };
  }

  const kandidaten = alle.slice(0, MAX_KANDIDATEN);
  const top = alle[0];
  if (!top) {
    return {
      actie: "even-kijken",
      gekozen: null,
      kandidaten: [],
      reden: ontvangen ? "Geen openstaande factuur gevonden die hierbij past." : "Geen bon gevonden die hierbij past.",
    };
  }
  const metNummer = alle.filter((k) => k.nummerGevonden);
  const anderen = alle.filter((k) => k !== top && k.zekerheid >= 750);
  if (top.zekerheid === 1000 && metNummer.length === 1 && anderen.length === 0) {
    return { actie: top.voorstel.soort === "bon-betaald" ? "koppel" : "boek", gekozen: top, kandidaten, reden: top.reden };
  }
  const meerdere = alle.filter((k) => k.zekerheid >= 400).length > 1;
  return {
    actie: "even-kijken",
    gekozen: top,
    kandidaten,
    reden: meerdere ? "Er zijn meerdere mogelijke koppelingen; kies zelf de juiste." : top.reden,
  };
}
