// ---------------------------------------------------------------------------
// Btw-concept: de controle (puur, zonder prisma). Meldt wat er niet klopt of nog moet gebeuren voor je een kwartaal
// indient. Elke melding heeft een ernst, een korte tekst in gewoon Nederlands en een verwijzing met id's (geen namen).
// ---------------------------------------------------------------------------

import type { BtwBerekening } from "./kern";
import type { BtwMelding, MeldingErnst, MeldingVerwijzing } from "./labels";

/** Een boekregel in de periode, ook zonder btw-code (voor de controle op ontbrekende codes en percentages). */
export interface ControleRegel {
  boekingId: string;
  rekeningSoort: string;
  debetCents: number;
  creditCents: number;
  isBtwRegel: boolean;
  btwBasisCents: number | null;
  btwCode: string | null;
  tariefBasispunten: number | null;
  richting: "VERKOOP" | "INKOOP" | null;
}

export interface ControleBon {
  id: string;
  status: string;
  /** dag waarop hij is geupload */
  geuploadOp: string;
  bonDatum?: string | undefined;
}

/** Een geboekte bon met btw: de boekdatum tegenover de datum op de bon. */
export interface ControleBonBoeking {
  boekingId: string;
  bonId: string;
  boekDatum: string;
  bonDatum: string;
}

export interface ControleInvoer {
  van: string;
  tot: string;
  /** de dag van vandaag, "2026-04-10" */
  vandaag: string;
  btwPlichtig: boolean;
  berekening: BtwBerekening;
  regels: readonly ControleRegel[];
  /** saldo van de btw-rekeningen in de periode (te betalen btw min te vorderen btw), of null als dat niet is op te halen */
  rekeningSaldoCents: number | null;
  /** bonnen die nog niet geboekt zijn en niet afgewezen */
  bonnenZonderBoeking: readonly ControleBon[];
  /** geboekte bonnen met een btw-regel, waarvan de bon- en boekdatum in verschillende kwartalen kunnen vallen */
  bonBoekingen: readonly ControleBonBoeking[];
}

const MAX_ID = 25;
const euro = (cents: number): string => (cents / 100).toLocaleString("nl-NL", { style: "currency", currency: "EUR" });

function verwijzing(boekingen: readonly string[] = [], bonnen: readonly string[] = []): MeldingVerwijzing {
  const uniek = (l: readonly string[]) => [...new Set(l)];
  const b = uniek(boekingen);
  const n = uniek(bonnen);
  return { boekingen: b.slice(0, MAX_ID), bonnen: n.slice(0, MAX_ID), aantal: b.length + n.length };
}

const melding = (code: string, ernst: MeldingErnst, tekst: string, v: MeldingVerwijzing = verwijzing()): BtwMelding => ({ code, ernst, tekst, verwijzing: v });

const inPeriode = (dag: string, van: string, tot: string): boolean => dag >= van && dag <= tot;

function kwartaalSleutel(dag: string): string {
  const jaar = Number(dag.slice(0, 4));
  const maand = Number(dag.slice(5, 7));
  return `${jaar}-K${Math.floor((maand - 1) / 3) + 1}`;
}

/** Hoeveel een regel meetelt, positief aan de kant van het btw-bedrag (zoals btwOverzichtUit): verkoop credit, inkoop debet. */
function nettoBedrag(r: ControleRegel): number {
  return r.richting === "VERKOOP" ? r.creditCents - r.debetCents : r.debetCents - r.creditCents;
}

const SOORTEN_MET_BTW = new Set(["OMZET", "KOSTEN"]);

export function controleerBtw(invoer: ControleInvoer): BtwMelding[] {
  const uit: BtwMelding[] = [];
  const { berekening: b } = invoer;

  // (a) rubrieken tegenover de btw-rekeningen
  if (invoer.rekeningSaldoCents !== null && invoer.rekeningSaldoCents !== b.saldoCents) {
    const verschil = b.saldoCents - invoer.rekeningSaldoCents;
    uit.push(
      melding(
        "BTW_WIJKT_AF_VAN_REKENINGEN",
        "blokkeert",
        `De btw in dit concept (${euro(b.saldoCents)}) is niet gelijk aan wat op de btw-rekeningen in de boekhouding staat (${euro(invoer.rekeningSaldoCents)}). Het verschil is ${euro(Math.abs(verschil))}. Zoek uit welke boeking geen of een verkeerde btw-code heeft en herstel dat voor je indient.`,
      ),
    );
  }

  // rubrieken die we niet kennen
  if (b.onbekendeRubrieken.length > 0) {
    uit.push(
      melding(
        "ONBEKENDE_RUBRIEK",
        "blokkeert",
        `Een btw-code verwijst naar een rubriek die niet in de aangifte past (${b.onbekendeRubrieken.join(", ")}). Dat bedrag staat dus niet in het concept. Laat de btw-code door een accountant corrigeren.`,
      ),
    );
  }

  // (b) omzet- of kostenboekingen zonder btw-code
  const zonderCode = invoer.regels.filter((r) => !r.isBtwRegel && r.btwCode === null && SOORTEN_MET_BTW.has(r.rekeningSoort));
  if (zonderCode.length > 0) {
    const ids = zonderCode.map((r) => r.boekingId);
    const v = verwijzing(ids);
    uit.push(
      melding(
        "GEEN_BTW_CODE",
        "let-op",
        `${v.aantal} ${v.aantal === 1 ? "boeking heeft" : "boekingen hebben"} geen btw-code, terwijl het om omzet of kosten gaat. Kies per boeking de juiste btw-code, of controleer dat er echt geen btw op zit (bijvoorbeeld bij een buitenlandse leverancier).`,
        v,
      ),
    );
  }

  // (c) bonnen zonder boeking in het kwartaal (de bonnen die nog nagekeken moeten worden komen onder (f))
  const wachtend = invoer.bonnenZonderBoeking.filter((bon) => {
    if (bon.status === "EVEN_KIJKEN") return false;
    if (bon.bonDatum) return inPeriode(bon.bonDatum, invoer.van, invoer.tot);
    return bon.geuploadOp <= invoer.tot;
  });
  if (wachtend.length > 0) {
    const v = verwijzing([], wachtend.map((x) => x.id));
    uit.push(
      melding(
        "BON_ZONDER_BOEKING",
        "let-op",
        `${v.aantal} ${v.aantal === 1 ? "bon is" : "bonnen zijn"} nog niet geboekt. De btw daarop (voorbelasting) telt dus niet mee. Boek de ${v.aantal === 1 ? "bon" : "bonnen"} of wijs ${v.aantal === 1 ? "hem" : "ze"} af.`,
        v,
      ),
    );
  }

  // (d) boeking in een ander kwartaal dan de bon
  const verkeerd = invoer.bonBoekingen.filter((x) => {
    const boekIn = inPeriode(x.boekDatum, invoer.van, invoer.tot);
    const bonIn = inPeriode(x.bonDatum, invoer.van, invoer.tot);
    return boekIn !== bonIn && kwartaalSleutel(x.boekDatum) !== kwartaalSleutel(x.bonDatum);
  });
  if (verkeerd.length > 0) {
    const v = verwijzing(verkeerd.map((x) => x.boekingId), verkeerd.map((x) => x.bonId));
    uit.push(
      melding(
        "BOEKING_IN_ANDER_KWARTAAL",
        "let-op",
        `${v.boekingen.length} ${v.boekingen.length === 1 ? "boeking staat" : "boekingen staan"} in een ander kwartaal dan de datum op de bon. Controleer of de btw in het juiste kwartaal valt; zo nodig boek je tegen en opnieuw met de juiste datum.`,
        v,
      ),
    );
  }

  // (e) negatieve of onwaarschijnlijke percentages: per boeking en btw-code de btw tegenover de grondslag
  const groepen = new Map<string, { boekingId: string; tarief: number; basis: number; btw: number; regels: number }>();
  for (const r of invoer.regels) {
    if (r.btwCode === null || r.tariefBasispunten === null || r.richting === null) continue;
    const sleutel = `${r.boekingId}\u0000${r.btwCode}`;
    const g = groepen.get(sleutel) ?? { boekingId: r.boekingId, tarief: r.tariefBasispunten, basis: 0, btw: 0, regels: 0 };
    const netto = nettoBedrag(r);
    if (r.isBtwRegel) g.btw += netto;
    else if (r.btwBasisCents !== null) g.basis += (netto >= 0 ? 1 : -1) * r.btwBasisCents;
    g.regels += 1;
    groepen.set(sleutel, g);
  }
  const teken: string[] = [];
  const afwijking: string[] = [];
  const onwaarschijnlijk: string[] = [];
  for (const g of groepen.values()) {
    if (g.tarief < 0 || g.tarief > 2500) {
      onwaarschijnlijk.push(g.boekingId);
      continue;
    }
    if (g.basis === 0 && g.btw === 0) continue;
    if ((g.basis > 0 && g.btw < 0) || (g.basis < 0 && g.btw > 0)) {
      teken.push(g.boekingId);
      continue;
    }
    const verwacht = Math.round((g.basis * g.tarief) / 10000);
    if (Math.abs(g.btw - verwacht) > Math.max(2, g.regels)) afwijking.push(g.boekingId);
  }
  if (teken.length > 0 || onwaarschijnlijk.length > 0) {
    const v = verwijzing([...teken, ...onwaarschijnlijk]);
    uit.push(
      melding(
        "BTW_PERCENTAGE_ONMOGELIJK",
        "blokkeert",
        `${v.aantal} ${v.aantal === 1 ? "boeking heeft" : "boekingen hebben"} een negatieve btw bij een positief bedrag (of een tarief dat niet kan). Controleer de btw-code en de bedragen van ${v.aantal === 1 ? "die boeking" : "die boekingen"}.`,
        v,
      ),
    );
  }
  if (afwijking.length > 0) {
    const v = verwijzing(afwijking);
    uit.push(
      melding(
        "BTW_PERCENTAGE_WIJKT_AF",
        "let-op",
        `Bij ${v.aantal} ${v.aantal === 1 ? "boeking" : "boekingen"} is het btw-bedrag niet gelijk aan het tarief van de gekozen btw-code. Controleer of de juiste code is gebruikt.`,
        v,
      ),
    );
  }

  // (f) bonnen waar een mens nog naar moet kijken (ongeacht de datum)
  const evenKijken = invoer.bonnenZonderBoeking.filter((x) => x.status === "EVEN_KIJKEN");
  if (evenKijken.length > 0) {
    const v = verwijzing([], evenKijken.map((x) => x.id));
    uit.push(
      melding(
        "EVEN_KIJKEN_OPEN",
        "blokkeert",
        `${v.aantal} ${v.aantal === 1 ? "bon wacht" : "bonnen wachten"} nog op jouw controle (tabblad Bonnen: even kijken). Keur ${v.aantal === 1 ? "hem" : "ze"} goed of af, anders weet je niet zeker of de voorbelasting klopt.`,
        v,
      ),
    );
  }

  // algemene opmerkingen
  if (!invoer.btwPlichtig) {
    uit.push(
      melding("NIET_BTW_PLICHTIG", "info", "Deze administratie staat niet als btw-plichtig aangemerkt. Laat een accountant bevestigen of je een btw-aangifte moet doen."),
    );
  }
  if (invoer.vandaag <= invoer.tot) {
    uit.push(melding("KWARTAAL_LOOPT_NOG", "info", "Dit kwartaal is nog niet voorbij: er kunnen nog boekingen bijkomen. Maak het concept opnieuw als het kwartaal om is."));
  }
  if (!invoer.regels.some((r) => r.btwCode !== null)) {
    uit.push(melding("LEGE_PERIODE", "info", "Er staan in dit kwartaal geen boekingen met btw. Is dat juist, dan is er niets af te dragen."));
  }

  const volgorde: Record<MeldingErnst, number> = { blokkeert: 0, "let-op": 1, info: 2 };
  return uit.sort((x, y) => volgorde[x.ernst] - volgorde[y.ernst]);
}

export const heeftBlokkade = (meldingen: readonly BtwMelding[]): boolean => meldingen.some((m) => m.ernst === "blokkeert");
