// ---------------------------------------------------------------------------
// Export voor de accountant: de datalaag. Haalt de boekregels en het rekeningschema op en geeft ze aan de pure kern
// (kern.ts, xaf.ts, controle.ts). Alleen lezen: er wordt niets geschreven. De boekingen bevatten geen persoonsgegevens
// (zie omschrijving.ts); van een bon gaat alleen het nummer (id) mee, nooit het bestand, de leverancier of de OCR-tekst.
// ---------------------------------------------------------------------------

import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { boekDatum } from "../boekstuk";
import { bonnenZonderBoeking } from "../lezen";
import { dagVanDatumKolom } from "../lezen-kern";
import { exportControle, type ExportKwartaal, type ExportMelding } from "./controle";
import {
  bepaalPeriode,
  kolommenbalans,
  kwartalenIn,
  maandenIn,
  winstVerlies,
  type ExportPeriode,
  type ExportRekening,
  type ExportSom,
  type ExportSoort,
  type Kolommenbalans,
  type PeriodeInvoer,
  type WinstVerlies,
} from "./kern";
import { maakXaf, type XafUitvoer } from "./xaf";

interface AdministratieKop {
  id: string;
  naam: string;
  juridischeNaam: string;
  land: string;
  soort: "ECHT" | "TEST";
  valuta: string;
  boekjaarStartMaand: number;
  btwPlichtig: boolean;
  btwNummer: string | null;
}

async function leesAdministratie(administratieId: string): Promise<AdministratieKop> {
  const a = await prisma.boekAdministratie.findUnique({
    where: { id: administratieId },
    select: { id: true, naam: true, juridischeNaam: true, land: true, soort: true, valuta: true, boekjaarStartMaand: true, btwPlichtig: true, btwNummer: true },
  });
  if (!a) throw AppError.notFound("Deze administratie bestaat niet.");
  return a;
}

async function leesRekeningen(administratieId: string): Promise<{ rekeningen: ExportRekening[]; nummerVan: Map<string, string> }> {
  const rijen = await prisma.boekRekening.findMany({ where: { administratieId }, select: { id: true, nummer: true, naam: true, soort: true } });
  return {
    rekeningen: rijen.map((r) => ({ nummer: r.nummer, naam: r.naam, soort: r.soort as ExportSoort })),
    nummerVan: new Map(rijen.map((r) => [r.id, r.nummer] as const)),
  };
}

type Groep = { rekeningId: string; _sum: { debetCents: number | null; creditCents: number | null } };

function naarSommen(groepen: readonly Groep[], nummerVan: ReadonlyMap<string, string>): ExportSom[] {
  return groepen.flatMap((g) => {
    const rekeningNummer = nummerVan.get(g.rekeningId);
    return rekeningNummer === undefined ? [] : [{ rekeningNummer, debetCents: g._sum.debetCents ?? 0, creditCents: g._sum.creditCents ?? 0 }];
  });
}

export interface ExportGegevens {
  administratie: { id: string; naam: string; soort: "ECHT" | "TEST"; valuta: string };
  periode: ExportPeriode;
  kolommen: Kolommenbalans;
  wv: WinstVerlies;
}

/** De kolommenbalans en de winst-en-verliesrekening van een boekjaar of een eigen periode binnen één boekjaar. */
export async function leesExport(administratieId: string, invoer: PeriodeInvoer): Promise<ExportGegevens> {
  const administratie = await leesAdministratie(administratieId);
  const periode = bepaalPeriode(invoer, administratie.boekjaarStartMaand);
  const { rekeningen, nummerVan } = await leesRekeningen(administratieId);
  const WV = ["OMZET", "KOSTEN"] as const;
  const BALANS = ["ACTIVA", "PASSIVA"] as const;

  const [opening, mutaties, vorig] = await Promise.all([
    prisma.boekRegel.groupBy({
      by: ["rekeningId"],
      where: {
        OR: [
          { rekening: { soort: { in: [...BALANS] } }, boeking: { administratieId, datum: { lt: boekDatum(periode.van) } } },
          { rekening: { soort: { in: [...WV] } }, boeking: { administratieId, datum: { gte: boekDatum(periode.boekjaarStart), lt: boekDatum(periode.van) } } },
        ],
      },
      _sum: { debetCents: true, creditCents: true },
    }),
    prisma.boekRegel.groupBy({
      by: ["rekeningId"],
      where: { boeking: { administratieId, datum: { gte: boekDatum(periode.van), lte: boekDatum(periode.tot) } } },
      _sum: { debetCents: true, creditCents: true },
    }),
    prisma.boekRegel.aggregate({
      where: { rekening: { soort: { in: [...WV] } }, boeking: { administratieId, datum: { lt: boekDatum(periode.boekjaarStart) } } },
      _sum: { debetCents: true, creditCents: true },
    }),
  ]);

  const mutatieSommen = naarSommen(mutaties, nummerVan);
  const resultaatVorigeJarenCents = (vorig._sum.creditCents ?? 0) - (vorig._sum.debetCents ?? 0);
  return {
    administratie: { id: administratie.id, naam: administratie.naam, soort: administratie.soort, valuta: administratie.valuta },
    periode,
    kolommen: kolommenbalans({
      valuta: administratie.valuta,
      van: periode.van,
      tot: periode.tot,
      rekeningen,
      openingSommen: naarSommen(opening, nummerVan),
      mutatieSommen,
      resultaatVorigeJarenCents,
    }),
    wv: winstVerlies({ valuta: administratie.valuta, van: periode.van, tot: periode.tot, rekeningen, mutatieSommen }),
  };
}

/** De Auditfile van één boekjaar. */
export async function leesXaf(administratieId: string, jaar: number, nu: Date = new Date()): Promise<{ xaf: XafUitvoer; periode: ExportPeriode; soort: "ECHT" | "TEST" }> {
  const administratie = await leesAdministratie(administratieId);
  const gegevens = await leesExport(administratieId, { jaar });
  const { periode } = gegevens;
  const { rekeningen } = await leesRekeningen(administratieId);

  const boekingen = await prisma.boekBoeking.findMany({
    where: { administratieId, datum: { gte: boekDatum(periode.van), lte: boekDatum(periode.tot) } },
    orderBy: [{ datum: "asc" }, { boekstuk: "asc" }],
    select: {
      boekstuk: true,
      dagboek: true,
      datum: true,
      omschrijving: true,
      bon: { select: { id: true } },
      regels: {
        orderBy: { volgorde: "asc" },
        select: { debetCents: true, creditCents: true, omschrijving: true, rekening: { select: { nummer: true } } },
      },
    },
  });

  const xaf = maakXaf({
    bedrijf: { id: administratie.id, naam: administratie.juridischeNaam, land: administratie.land, btwNummer: administratie.btwNummer },
    valuta: administratie.valuta,
    jaar: periode.jaar,
    van: periode.van,
    tot: periode.tot,
    startMaand: administratie.boekjaarStartMaand,
    rekeningen,
    opening: gegevens.kolommen.rijen
      .filter((r) => r.kant === "BALANS" && (r.openingDebetCents > 0 || r.openingCreditCents > 0))
      .map((r) => ({ rekeningNummer: r.rekeningNummer, debetCents: r.openingDebetCents, creditCents: r.openingCreditCents })),
    boekingen: boekingen.map((b) => ({
      boekstuk: b.boekstuk,
      dagboek: b.dagboek,
      datum: dagVanDatumKolom(b.datum),
      omschrijving: b.omschrijving,
      valuta: administratie.valuta,
      docRef: b.bon?.id ?? b.boekstuk,
      regels: b.regels.map((r) => ({
        rekeningNummer: r.rekening.nummer,
        debetCents: r.debetCents,
        creditCents: r.creditCents,
        ...(r.omschrijving ? { omschrijving: r.omschrijving } : {}),
      })),
    })),
    aangemaakt: amsterdamDayKey(nu),
  });
  return { xaf, periode, soort: administratie.soort };
}

export interface ExportControleUitkomst {
  periode: ExportPeriode;
  administratie: { naam: string; soort: "ECHT" | "TEST"; valuta: string };
  meldingen: ExportMelding[];
  /** de kolommenbalans sluit */
  inBalans: boolean;
  boekingAantal: number;
}

function blokkadesUit(inhoud: unknown): number {
  const meldingen = (inhoud as { meldingen?: unknown } | null)?.meldingen;
  return Array.isArray(meldingen) ? meldingen.filter((m) => (m as { ernst?: unknown } | null)?.ernst === "blokkeert").length : 0;
}

/** Wat je nog moet doen voordat je de export aan een accountant geeft. */
export async function leesExportControle(administratieId: string, invoer: PeriodeInvoer, nu: Date = new Date()): Promise<ExportControleUitkomst> {
  const administratie = await leesAdministratie(administratieId);
  const gegevens = await leesExport(administratieId, invoer);
  const { periode } = gegevens;
  const maanden = maandenIn(periode.van, periode.tot);
  const kwartalen = kwartalenIn(periode.van, periode.tot);
  const jaren = [...new Set(kwartalen.map((k) => k.jaar))];

  const [boekingAantal, bonnen, vergrendeld, btwPerioden] = await Promise.all([
    prisma.boekBoeking.count({ where: { administratieId, datum: { gte: boekDatum(periode.van), lte: boekDatum(periode.tot) } } }),
    bonnenZonderBoeking(administratieId),
    prisma.boekPeriode.findMany({ where: { administratieId, status: "VERGRENDELD", jaar: { in: [...new Set(maanden.map((m) => m.jaar))] } }, select: { jaar: true, maand: true } }),
    prisma.boekBtwPeriode.findMany({
      where: { administratieId, jaar: { in: jaren } },
      select: { jaar: true, kwartaal: true, aangiftes: { orderBy: { versie: "desc" }, take: 1, select: { status: true, rubrieken: true } } },
    }),
  ]);

  const slot = new Set(vergrendeld.map((p) => `${p.jaar}-${p.maand}`));
  const btw: ExportKwartaal[] = kwartalen.map((k) => {
    const rij = btwPerioden.find((p) => p.jaar === k.jaar && p.kwartaal === k.kwartaal);
    const laatste = rij?.aangiftes[0];
    const status = laatste && laatste.status !== "VERVANGEN" ? (laatste.status as ExportKwartaal["status"]) : "GEEN";
    return { jaar: k.jaar, kwartaal: k.kwartaal, status, blokkades: laatste ? blokkadesUit(laatste.rubrieken) : 0 };
  });

  return {
    periode,
    administratie: { naam: administratie.naam, soort: administratie.soort, valuta: administratie.valuta },
    inBalans: gegevens.kolommen.inBalans,
    boekingAantal,
    meldingen: exportControle({
      vandaag: amsterdamDayKey(nu),
      van: periode.van,
      tot: periode.tot,
      soort: administratie.soort,
      boekingAantal,
      inBalans: gegevens.kolommen.inBalans,
      bonnen: bonnen.map((b) => ({ status: b.status })),
      maanden: maanden.map((m) => ({ ...m, vergrendeld: slot.has(`${m.jaar}-${m.maand}`) })),
      btwPlichtig: administratie.btwPlichtig,
      kwartalen: btw,
    }),
  };
}
