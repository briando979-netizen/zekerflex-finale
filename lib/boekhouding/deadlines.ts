// ---------------------------------------------------------------------------
// Boekhouding: de lijst met deadlines (puur, zonder prisma). Alleen regels die de eigenaar heeft doorgegeven of die
// vaststaan voor een Nederlandse btw-aangifte; niets verzonnen. Bij elke datum geldt: een accountant of US tax
// preparer bevestigt de datum (de datums hangen af van het boekjaar, de rechtsvorm en of er btw-plicht is).
// Er is bewust geen tweede takenlijst naast lib/admin/owner-todos.ts: die kan deze lijst overnemen.
// ---------------------------------------------------------------------------

import { amsterdamParts, amsterdamToUtc } from "@/lib/time/amsterdam";

export interface Deadline {
  /** stabiele sleutel, bv. "btw-2026-k4" */
  sleutel: string;
  titel: string;
  /** laatste moment van de dag, Amsterdamse tijd (een echt tijdstip, dus veilig in UTC) */
  datum: Date;
  /** wat er nodig is om het te kunnen doen */
  wat: string;
  waarschuwing?: string | undefined;
  bevestigDoor: string;
}

export const BEVESTIG_DOOR = "Een accountant of US tax preparer bevestigt de datum.";

/** De maand na elk kwartaal (K1 t/m K4): de aangifte is uiterlijk de laatste dag van die maand. */
const DEADLINE_MAAND_NA_KWARTAAL: readonly number[] = [4, 7, 10, 1];

function eindeVanDag(jaar: number, maand: number, dag: number): Date {
  return amsterdamToUtc(jaar, maand, dag, 23, 59, 59);
}

/** Laatste dag van een maand (maand 1-12). */
function laatsteDag(jaar: number, maand: number): number {
  return new Date(Date.UTC(jaar, maand, 0)).getUTCDate();
}

/** Alle deadlines van een kalenderjaar, ongesorteerd. */
function deadlinesVoorJaar(jaar: number): Deadline[] {
  const lijst: Deadline[] = [];

  lijst.push({
    sleutel: `delaware-franchise-tax-${jaar}`,
    titel: `Delaware Annual Franchise Tax Report ${jaar}`,
    datum: eindeVanDag(jaar, 3, 1),
    wat: "Het jaarverslag en de franchise tax van Zekerflex, Inc. via de Delaware Division of Corporations (registered agent, aandelenstructuur, bestuurders).",
    bevestigDoor: BEVESTIG_DOOR,
  });

  lijst.push({
    sleutel: `us-1120-5472-${jaar}`,
    titel: `US Form 1120 met Form 5472 over ${jaar - 1}`,
    datum: eindeVanDag(jaar, 4, 15),
    wat: "De winstaangifte (Form 1120) van de Inc., met Form 5472 voor transacties met de buitenlandse eigenaar. Een jaarrekening en een lijst van alle transacties met de eigenaar zijn nodig.",
    waarschuwing:
      "Op een gemiste of onvolledige Form 5472 staat een hoge boete. Laat de US tax preparer dit niet na en laat de datum (en uitstel) bevestigen.",
    bevestigDoor: BEVESTIG_DOOR,
  });

  // Nederlandse btw en ICP per kwartaal: uiterlijk de laatste dag van de maand na het kwartaal.
  // De sleutel noemt het jaar van het kwartaal; de deadline van K4 valt in januari van het jaar erna.
  DEADLINE_MAAND_NA_KWARTAAL.forEach((mnd, i) => {
    const kwartaal = i + 1;
    const deadlineJaar = kwartaal === 4 ? jaar + 1 : jaar;
    const dag = laatsteDag(deadlineJaar, mnd);
    lijst.push({
      sleutel: `btw-${jaar}-k${kwartaal}`,
      titel: `Btw-aangifte ${jaar} kwartaal ${kwartaal}`,
      datum: eindeVanDag(deadlineJaar, mnd, dag),
      wat: "De btw-aangifte en betaling bij de Belastingdienst, alleen als de administratie btw-plichtig is. Nodig: de boekingen van het kwartaal met btw-codes en de bonnen.",
      bevestigDoor: BEVESTIG_DOOR,
    });
    lijst.push({
      sleutel: `icp-${jaar}-k${kwartaal}`,
      titel: `Opgaaf intracommunautaire prestaties (ICP) ${jaar} kwartaal ${kwartaal}`,
      datum: eindeVanDag(deadlineJaar, mnd, dag),
      wat: "De ICP-opgave, alleen als er in dat kwartaal diensten of leveringen met btw verlegd aan EU-bedrijven zijn gefactureerd. Nodig: de btw-nummers van die klanten en de bedragen.",
      bevestigDoor: BEVESTIG_DOOR,
    });
  });

  return lijst;
}

/** De eenmalige deadline: de 83(b)-verklaring bij de IRS. */
function eenmalig(): Deadline[] {
  return [
    {
      sleutel: "irs-83b-2026",
      titel: "83(b)-verklaring bij de IRS",
      datum: eindeVanDag(2026, 12, 9),
      wat: "De 83(b)-verklaring (eenmalig) voor de aandelen, bij de IRS ingediend. Nodig: de datum van uitgifte, het aantal aandelen en de waarde op dat moment.",
      waarschuwing: "Eenmalig en niet te herstellen als de datum is gemist: laat de datum bevestigen en dien ruim eerder in.",
      bevestigDoor: BEVESTIG_DOOR,
    },
  ];
}

/**
 * De komende deadlines vanaf `nu` (tot `maanden` maanden vooruit, standaard 15), op datum gesorteerd. Een verstreken
 * deadline staat er niet meer in. De lijst is puur: geef `nu` mee voor een bevroren klok in tests.
 */
export function deadlineLijst(nu: Date = new Date(), maanden = 15): Deadline[] {
  const { year } = amsterdamParts(nu);
  const grens = new Date(nu.getTime() + maanden * 31 * 24 * 3600 * 1000);
  const kandidaten = [...eenmalig(), ...[year - 1, year, year + 1, year + 2].flatMap(deadlinesVoorJaar)];
  const gezien = new Set<string>();
  return kandidaten
    .filter((d) => d.datum.getTime() >= nu.getTime() && d.datum.getTime() <= grens.getTime())
    .filter((d) => (gezien.has(d.sleutel) ? false : (gezien.add(d.sleutel), true)))
    .sort((a, b) => a.datum.getTime() - b.datum.getTime() || a.sleutel.localeCompare(b.sleutel));
}

/** Naam waaronder de AI-accountant de lijst leest. */
export const deadlines = deadlineLijst;
