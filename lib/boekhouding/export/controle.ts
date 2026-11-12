// ---------------------------------------------------------------------------
// Export voor de accountant: de controle "Wat je nog moet doen voor je dit doorgeeft" (puur, zonder prisma). De
// datalaag (export.ts) haalt de gegevens op en geeft ze hieraan; hier staan alleen de regels en de Nederlandse teksten.
// De btw-controle zelf (controleerBtw) draait bij het maken van een btw-concept; hier wordt alleen gekeken wat daarvan
// is vastgelegd.
// ---------------------------------------------------------------------------

import type { MeldingErnst } from "../btw/labels";

export interface ExportMelding {
  code: string;
  ernst: MeldingErnst;
  tekst: string;
}

export interface ExportBon {
  status: string;
}

export interface ExportMaand {
  jaar: number;
  maand: number;
  vergrendeld: boolean;
}

export interface ExportKwartaal {
  jaar: number;
  kwartaal: number;
  /** de nieuwste versie van het btw-concept, of GEEN als er nog niets is berekend */
  status: "GEEN" | "BEREKEND" | "GOEDGEKEURD" | "INGEDIEND";
  /** blokkerende meldingen in die versie */
  blokkades: number;
}

export interface ExportControleInvoer {
  /** de Amsterdamse dag van vandaag */
  vandaag: string;
  van: string;
  tot: string;
  soort: "ECHT" | "TEST";
  boekingAantal: number;
  inBalans: boolean;
  /** bonnen zonder boeking en niet afgewezen */
  bonnen: readonly ExportBon[];
  /** de maanden van de periode (ook de maanden zonder vergrendeling) */
  maanden: readonly ExportMaand[];
  btwPlichtig: boolean;
  /** de kwartalen die in de periode vallen */
  kwartalen: readonly ExportKwartaal[];
}

const MAAND_NAMEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"] as const;
const maandTekst = (m: ExportMaand): string => `${MAAND_NAMEN[m.maand - 1] ?? String(m.maand)} ${m.jaar}`;
const meervoud = (n: number, een: string, meer: string): string => (n === 1 ? een : meer);

const laatsteDagVan = (jaar: number, maand: number): string => {
  const d = new Date(Date.UTC(jaar, maand, 0)).getUTCDate();
  return `${jaar}-${String(maand).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
};

export function exportControle(i: ExportControleInvoer): ExportMelding[] {
  const uit: ExportMelding[] = [];

  if (!i.inBalans) {
    uit.push({
      code: "BALANS_SLUIT_NIET",
      ernst: "blokkeert",
      tekst: "Debet en credit van de kolommenbalans zijn niet gelijk. Geef dit niet door: zoek eerst uit welke boeking niet klopt.",
    });
  }
  if (i.soort === "TEST") {
    uit.push({ code: "TESTADMINISTRATIE", ernst: "let-op", tekst: "Dit is een testadministratie: de cijfers zijn niet echt en horen niet bij een accountant." });
  }
  if (i.boekingAantal === 0) {
    uit.push({ code: "LEGE_PERIODE", ernst: "info", tekst: "Er staan in deze periode geen boekingen. Is dat juist, dan krijgt je accountant een leeg bestand." });
  }

  const evenKijken = i.bonnen.filter((b) => b.status === "EVEN_KIJKEN").length;
  if (evenKijken > 0) {
    uit.push({
      code: "BONNEN_EVEN_KIJKEN",
      ernst: "blokkeert",
      tekst: `${evenKijken} ${meervoud(evenKijken, "bon wacht", "bonnen wachten")} nog op jouw controle (tabblad Bonnen: even kijken). Keur ${meervoud(evenKijken, "hem", "ze")} goed of af, anders ontbreekt er mogelijk een kostenpost.`,
    });
  }
  const overig = i.bonnen.length - evenKijken;
  if (overig > 0) {
    uit.push({
      code: "BONNEN_NIET_GEBOEKT",
      ernst: "let-op",
      tekst: `${overig} ${meervoud(overig, "bon is", "bonnen zijn")} nog niet geboekt en staat dus niet in dit overzicht. Boek ${meervoud(overig, "de bon", "de bonnen")} of wijs ${meervoud(overig, "hem", "ze")} af.`,
    });
  }

  const open = i.maanden.filter((m) => !m.vergrendeld && laatsteDagVan(m.jaar, m.maand) < i.vandaag);
  if (open.length > 0) {
    uit.push({
      code: "MAANDEN_NIET_VERGRENDELD",
      ernst: "let-op",
      tekst: `${open.length} ${meervoud(open.length, "afgelopen maand is", "afgelopen maanden zijn")} nog niet vergrendeld (${open.map(maandTekst).join(", ")}). Er kan dus nog een boeking bijkomen of veranderen nadat je dit hebt doorgegeven.`,
    });
  }
  if (i.tot >= i.vandaag) {
    uit.push({ code: "PERIODE_LOOPT_NOG", ernst: "info", tekst: "De periode is nog niet voorbij: er kunnen nog boekingen bijkomen. Een accountant wil meestal een afgesloten boekjaar." });
  }

  if (i.btwPlichtig) {
    const afgelopen = i.kwartalen.filter((k) => laatsteDagVan(k.jaar, k.kwartaal * 3) < i.vandaag);
    const geen = afgelopen.filter((k) => k.status === "GEEN");
    const nietIngediend = afgelopen.filter((k) => k.status === "BEREKEND" || k.status === "GOEDGEKEURD");
    const blokkades = afgelopen.filter((k) => k.blokkades > 0 && k.status !== "INGEDIEND");
    const lijst = (l: readonly ExportKwartaal[]): string => l.map((k) => `kwartaal ${k.kwartaal} ${k.jaar}`).join(", ");
    if (geen.length > 0) {
      uit.push({ code: "BTW_GEEN_CONCEPT", ernst: "let-op", tekst: `Voor ${lijst(geen)} is nog geen btw-concept gemaakt (tabblad Btw).` });
    }
    if (nietIngediend.length > 0) {
      uit.push({ code: "BTW_NIET_INGEDIEND", ernst: "let-op", tekst: `De btw-aangifte van ${lijst(nietIngediend)} is nog niet als ingediend gemarkeerd.` });
    }
    if (blokkades.length > 0) {
      uit.push({ code: "BTW_BLOKKADES", ernst: "let-op", tekst: `In het btw-concept van ${lijst(blokkades)} staan nog punten die eerst opgelost moeten worden (tabblad Btw).` });
    }
  }

  uit.push({
    code: "XAF_NIET_GEVALIDEERD",
    ernst: "info",
    tekst: "De XAF-auditfile is nog niet gecontroleerd tegen het officiële XSD. Laat hem testen door je accountant of met een XAF-validator.",
  });

  const volgorde: Record<MeldingErnst, number> = { blokkeert: 0, "let-op": 1, info: 2 };
  return uit.sort((a, b) => volgorde[a.ernst] - volgorde[b.ernst]);
}
