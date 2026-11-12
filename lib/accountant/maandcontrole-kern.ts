// ---------------------------------------------------------------------------
// Maandcontrole van de AI-accountant: "wat klopt er niet" in de boekhouding, in gewone taal,
// met per punt wat je moet doen. Puur: de gegevens komen uit lib/boekhouding/lezen.ts (alleen
// lezen) en worden hier alleen bekeken. De accountant verandert niets aan de boeken.
// Een boekregel bevat bewust geen namen, e-mail of IBAN; de bevindingen dus ook niet.
// ---------------------------------------------------------------------------

import type { BonZonderBoeking, BoekingRij } from "@/lib/boekhouding/lezen";
import type { OpenPost, ProefbalansRij } from "@/lib/boekhouding/lezen-kern";

export type Ernst = "probleem" | "nakijken" | "info";

export type BevindingSoort =
  | "kosten-zonder-bon"
  | "bon-niet-geboekt"
  | "mogelijk-dubbel"
  | "btw-zonder-code"
  | "datum-in-toekomst"
  | "debiteur-lang-open"
  | "uitschieter"
  | "te-veel-boekingen";

export interface Bevinding {
  soort: BevindingSoort;
  ernst: Ernst;
  titel: string;
  /** wat er aan de hand is en wat je moet doen, in gewone taal */
  uitleg: string;
  /** boekstuknummers waar het om gaat (hooguit een paar) */
  boekstukken: string[];
  bedragCents: number | null;
  actie: { label: string; href: string } | null;
}

/** Waar je iets oplost. Alleen bestaande schermen; Boekhouding zelf komt van b3. */
export const PLEKKEN = {
  facturen: "/admin/facturen",
  teDoen: "/admin/te-doen",
} as const;

export const MAX_BOEKSTUKKEN = 5;
/** Een debiteur staat "lang" open na zoveel dagen; na het dubbele is het een probleem. */
export const DEBITEUR_OUD_DAGEN = 30;
/** Een kostenpost is een uitschieter boven zoveel keer de mediaan van die rekening ... */
export const UITSCHIETER_FACTOR = 5;
/** ... en boven dit bedrag (kleine bedragen zijn geen nieuws). */
export const UITSCHIETER_MINIMUM_CENTS = 25_000;
/** Twee gelijke boekingen binnen zoveel dagen zijn mogelijk dubbel. */
export const DUBBEL_BINNEN_DAGEN = 3;

const euro = (cents: number) =>
  `€ ${(cents / 100).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function dagenTussen(van: string, tot: string): number {
  const ms = (d: string) => {
    const [j, m, t] = d.split("-").map(Number);
    return Date.UTC(j ?? 1970, (m ?? 1) - 1, t ?? 1);
  };
  return Math.round((ms(tot) - ms(van)) / 86_400_000);
}

/** Totaal van een boeking: de som van de debetkant (gelijk aan de creditkant, want hij sluit). */
export function boekingTotaal(b: BoekingRij): number {
  return b.regels.reduce((som, r) => som + r.debetCents, 0);
}

/** Per rekeningnummer: winst-en-verlies (WV) of balans, en of het een btw-rekening is (op naam). */
export interface RekeningInfo {
  kant: "BALANS" | "WV";
  btw: boolean;
}

export function rekeningInfo(proefbalans: readonly ProefbalansRij[]): Map<string, RekeningInfo> {
  return new Map(proefbalans.map((r) => [r.rekeningNummer, { kant: r.kant, btw: r.kant === "BALANS" && /\bbtw\b/i.test(r.naam) }] as const));
}

const lijst = (rijen: readonly BoekingRij[]) => rijen.slice(0, MAX_BOEKSTUKKEN).map((b) => b.boekstuk);
const nietTegenboeking = (b: BoekingRij) => b.bron !== "TEGENBOEKING" && b.bron !== "OPENING";

/** Kosten (debet op een winst-en-verliesrekening) buiten het verkoopdagboek zonder bonnetje erbij. */
export function kostenZonderBon(boekingen: readonly BoekingRij[], info: Map<string, RekeningInfo>): Bevinding | null {
  const zonder = boekingen.filter(
    (b) => nietTegenboeking(b) && b.dagboek !== "VERKOOP" && !b.heeftBijlage && b.regels.some((r) => r.debetCents > 0 && info.get(r.rekeningNummer)?.kant === "WV"),
  );
  if (zonder.length === 0) return null;
  const som = zonder.reduce((s, b) => s + boekingTotaal(b), 0);
  return {
    soort: "kosten-zonder-bon",
    ernst: "probleem",
    titel: `${zonder.length} ${zonder.length === 1 ? "kostenboeking" : "kostenboekingen"} zonder bonnetje`,
    uitleg: `Samen ${euro(som)}. Zonder bon of factuur kun je de kosten en de btw niet bewijzen; de Belastingdienst kan ze dan schrappen. Zoek de bon op en voeg hem toe aan de boeking.`,
    boekstukken: lijst(zonder),
    bedragCents: som,
    actie: null,
  };
}

/** Bonnetjes die er wel zijn maar nog niet geboekt. */
export function bonnenNietGeboekt(bonnen: readonly BonZonderBoeking[], vandaag: string): Bevinding | null {
  if (bonnen.length === 0) return null;
  const oudste = bonnen.reduce((o, b) => (b.geuploadOp < o ? b.geuploadOp : o), bonnen[0]?.geuploadOp ?? vandaag);
  const dagen = dagenTussen(oudste, vandaag);
  const evenKijken = bonnen.filter((b) => b.evenKijkenReden).length;
  return {
    soort: "bon-niet-geboekt",
    ernst: dagen > 14 ? "nakijken" : "info",
    titel: `${bonnen.length} ${bonnen.length === 1 ? "bonnetje" : "bonnetjes"} nog niet geboekt`,
    uitleg: `De oudste staat er ${dagen} ${dagen === 1 ? "dag" : "dagen"}${evenKijken ? `; ${evenKijken} ${evenKijken === 1 ? "wacht" : "wachten"} op "even kijken"` : ""}. Zolang een bon niet geboekt is, telt hij niet mee in de kosten en de btw.`,
    boekstukken: [],
    bedragCents: bonnen.reduce((s, b) => s + (b.totaalCents ?? 0), 0) || null,
    actie: null,
  };
}

/** Twee boekingen in hetzelfde dagboek met hetzelfde bedrag, dicht op elkaar: mogelijk twee keer geboekt. */
export function mogelijkDubbel(boekingen: readonly BoekingRij[]): Bevinding[] {
  const kandidaten = boekingen.filter(nietTegenboeking).filter((b) => boekingTotaal(b) > 0);
  const perSleutel = new Map<string, BoekingRij[]>();
  for (const b of kandidaten) {
    const sleutel = `${b.dagboek}|${boekingTotaal(b)}`;
    perSleutel.set(sleutel, [...(perSleutel.get(sleutel) ?? []), b]);
  }
  const uit: Bevinding[] = [];
  for (const groep of perSleutel.values()) {
    const opDatum = [...groep].sort((a, z) => a.datum.localeCompare(z.datum));
    for (let i = 1; i < opDatum.length; i++) {
      const a = opDatum[i - 1];
      const z = opDatum[i];
      if (!a || !z || a.bronId === z.bronId) continue;
      if (dagenTussen(a.datum, z.datum) > DUBBEL_BINNEN_DAGEN) continue;
      uit.push({
        soort: "mogelijk-dubbel",
        ernst: "nakijken",
        titel: `Mogelijk dubbel geboekt: ${euro(boekingTotaal(z))}`,
        uitleg: `Twee boekingen in het dagboek ${a.dagboek.toLowerCase()} met precies hetzelfde bedrag, ${dagenTussen(a.datum, z.datum)} ${dagenTussen(a.datum, z.datum) === 1 ? "dag" : "dagen"} na elkaar. Kijk of het twee echte posten zijn; is het dubbel, laat de tweede dan tegenboeken.`,
        boekstukken: [a.boekstuk, z.boekstuk],
        bedragCents: boekingTotaal(z),
        actie: null,
      });
    }
  }
  return uit;
}

/** Een regel op een btw-rekening zonder btw-code komt niet in het btw-overzicht (en dus niet in de aangifte). */
export function btwZonderCode(boekingen: readonly BoekingRij[], info: Map<string, RekeningInfo>): Bevinding | null {
  // Betalen of ontvangen van btw gaat via de bank en hoort geen btw-code te hebben.
  const mis = boekingen.filter((b) => nietTegenboeking(b) && b.dagboek !== "BANK" && b.regels.some((r) => info.get(r.rekeningNummer)?.btw && !r.btwCode));
  if (mis.length === 0) return null;
  return {
    soort: "btw-zonder-code",
    ernst: "probleem",
    titel: `Btw geboekt zonder btw-code (${mis.length} ${mis.length === 1 ? "boeking" : "boekingen"})`,
    uitleg: "Op een btw-rekening staat een bedrag zonder btw-code. Dat bedrag komt niet in het btw-overzicht per rubriek, waardoor de aangifte niet aansluit op de boeken. Laat de boeking corrigeren met de juiste btw-code.",
    boekstukken: lijst(mis),
    bedragCents: null,
    actie: null,
  };
}

/** Een boeking met een datum na vandaag: vaak een tikfout in het jaar of de maand. */
export function datumInToekomst(boekingen: readonly BoekingRij[], vandaag: string): Bevinding | null {
  const later = boekingen.filter((b) => b.datum > vandaag);
  if (later.length === 0) return null;
  return {
    soort: "datum-in-toekomst",
    ernst: "nakijken",
    titel: `${later.length} ${later.length === 1 ? "boeking" : "boekingen"} met een datum in de toekomst`,
    uitleg: "Een boeking hoort op de dag van de bon, de factuur of de betaling. Een datum na vandaag is meestal een tikfout en zet de post in de verkeerde periode (en het verkeerde btw-kwartaal).",
    boekstukken: lijst(later),
    bedragCents: null,
    actie: null,
  };
}

/** Facturen die een klant al lang niet betaald heeft. */
export function debiteurenLangOpen(posten: readonly OpenPost[], vandaag: string): Bevinding | null {
  const oud = posten.filter((p) => p.soort === "DEBITEUR" && dagenTussen(p.oudsteDatum, vandaag) > DEBITEUR_OUD_DAGEN);
  if (oud.length === 0) return null;
  const som = oud.reduce((s, p) => s + p.saldoCents, 0);
  const oudste = Math.max(...oud.map((p) => dagenTussen(p.oudsteDatum, vandaag)));
  return {
    soort: "debiteur-lang-open",
    ernst: oudste > 2 * DEBITEUR_OUD_DAGEN ? "probleem" : "nakijken",
    titel: `${oud.length} ${oud.length === 1 ? "factuur staat" : "facturen staan"} langer dan ${DEBITEUR_OUD_DAGEN} dagen open`,
    uitleg: `Samen ${euro(som)}; de oudste staat ${oudste} dagen open. Stuur een herinnering. Wordt een factuur niet meer betaald, laat dan beoordelen of hij als oninbaar afgeboekt moet worden.`,
    boekstukken: [],
    bedragCents: som,
    actie: { label: "Naar de facturen", href: PLEKKEN.facturen },
  };
}

function mediaan(getallen: readonly number[]): number {
  const s = [...getallen].sort((a, z) => a - z);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] ?? 0) : ((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2;
}

/** Een kostenpost die veel groter is dan gewoonlijk op dezelfde rekening. */
export function uitschieters(boekingen: readonly BoekingRij[], info: Map<string, RekeningInfo>): Bevinding[] {
  const perRekening = new Map<string, { boeking: BoekingRij; cents: number }[]>();
  for (const b of boekingen.filter(nietTegenboeking)) {
    for (const r of b.regels) {
      if (r.debetCents > 0 && info.get(r.rekeningNummer)?.kant === "WV") {
        perRekening.set(r.rekeningNummer, [...(perRekening.get(r.rekeningNummer) ?? []), { boeking: b, cents: r.debetCents }]);
      }
    }
  }
  const uit: Bevinding[] = [];
  for (const [rekening, posten] of perRekening) {
    if (posten.length < 5) continue; // te weinig om "gewoonlijk" te kennen
    const m = mediaan(posten.map((p) => p.cents));
    for (const p of posten) {
      if (p.cents > UITSCHIETER_FACTOR * m && p.cents > UITSCHIETER_MINIMUM_CENTS) {
        uit.push({
          soort: "uitschieter",
          ernst: "nakijken",
          titel: `Uitschieter op rekening ${rekening}: ${euro(p.cents)}`,
          uitleg: `Gewoonlijk is een post op deze rekening ongeveer ${euro(m)}. Kijk of het bedrag klopt (geen tikfout, geen verkeerde rekening).`,
          boekstukken: [p.boeking.boekstuk],
          bedragCents: p.cents,
          actie: null,
        });
      }
    }
  }
  return uit;
}

const ERNST: Record<Ernst, number> = { probleem: 0, nakijken: 1, info: 2 };

export interface ControleInvoer {
  vandaag: string;
  boekingen: readonly BoekingRij[];
  /** true als lezen.ts de limiet raakte */
  afgekapt: boolean;
  proefbalans: readonly ProefbalansRij[];
  openPosten: readonly OpenPost[];
  bonnen: readonly BonZonderBoeking[];
}

/** Alle controles; ernstigste eerst. */
export function maandcontrole(i: ControleInvoer): Bevinding[] {
  const info = rekeningInfo(i.proefbalans);
  const alle: (Bevinding | null)[] = [
    kostenZonderBon(i.boekingen, info),
    btwZonderCode(i.boekingen, info),
    debiteurenLangOpen(i.openPosten, i.vandaag),
    ...mogelijkDubbel(i.boekingen),
    datumInToekomst(i.boekingen, i.vandaag),
    ...uitschieters(i.boekingen, info),
    bonnenNietGeboekt(i.bonnen, i.vandaag),
    i.afgekapt
      ? {
          soort: "te-veel-boekingen",
          ernst: "info",
          titel: "Niet alle boekingen bekeken",
          uitleg: "Deze maand heeft meer boekingen dan de controle in één keer leest. De controle keek naar de eerste; kies een kortere periode om de rest te zien.",
          boekstukken: [],
          bedragCents: null,
          actie: null,
        }
      : null,
  ];
  return alle.filter((b): b is Bevinding => b !== null).sort((a, z) => ERNST[a.ernst] - ERNST[z.ernst]);
}

// Wat de route /api/admin/accountant/maandcontrole teruggeeft (hier, zodat het scherm geen servercode laadt).
export interface AdministratieControle {
  id: string;
  naam: string;
  van: string;
  tot: string;
  aantalBoekingen: number;
  bevindingen: Bevinding[];
}

export interface TermijnRij {
  sleutel: string;
  titel: string;
  /** Amsterdamse dag "2027-03-01" */
  dag: string;
  dagenTot: number;
  wat: string;
  waarschuwing: string | null;
  bevestigDoor: string;
  /** afgevinkt in Te doen */
  klaar: boolean;
}

export interface MaandcontroleUitslag {
  vandaag: string;
  administraties: AdministratieControle[];
  termijnen: TermijnRij[];
}

/** De vorige volle maand ("2026-11-12" → 2026-10-01 t/m 2026-10-31). */
export function vorigeMaand(vandaag: string): { van: string; tot: string } {
  const j = Number(vandaag.slice(0, 4));
  const m = Number(vandaag.slice(5, 7));
  const jaar = m === 1 ? j - 1 : j;
  const maand = m === 1 ? 12 : m - 1;
  const laatste = new Date(Date.UTC(jaar, maand, 0)).getUTCDate();
  const mm = String(maand).padStart(2, "0");
  return { van: `${jaar}-${mm}-01`, tot: `${jaar}-${mm}-${String(laatste).padStart(2, "0")}` };
}
