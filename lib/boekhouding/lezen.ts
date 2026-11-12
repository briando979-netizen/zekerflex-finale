// ---------------------------------------------------------------------------
// Boekhouding: leesfuncties voor de AI-accountant (lib/accountant leest ALLEEN via deze exports). Alleen lezen: er
// wordt hier niets geschreven. Datums zijn Amsterdamse dagsleutels "2026-04-10", beide kanten inclusief. Bedragen in
// gehele centen. Persoonsgegevens: de boekhouding bevat die niet (zie omschrijving.ts); van een bon geven we nooit de
// OCR-tekst of de leverancier terug.
// ---------------------------------------------------------------------------

import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { boekDatum } from "./boekstuk";
import {
  btwOverzichtUit,
  dagVanDatumKolom,
  kwartaalGrenzen,
  openPostenUit,
  proefbalansRijen,
  type BtwOverzicht,
  type OpenPost,
  type ProefbalansRij,
} from "./lezen-kern";
import { isGeldigeBoekdag } from "./sluiting";

export { deadlineLijst, deadlines } from "./deadlines";
export type { BtwOverzicht, OpenPost, ProefbalansRij } from "./lezen-kern";

function controleerDag(dag: string, veld: string): void {
  if (!isGeldigeBoekdag(dag)) throw AppError.validation(`${veld} is geen geldige dag (verwacht: JJJJ-MM-DD).`);
}

function controleerPeriode(van: string, tot: string): void {
  controleerDag(van, "De begindatum");
  controleerDag(tot, "De einddatum");
  if (van > tot) throw AppError.validation("De begindatum ligt na de einddatum.");
}

export interface AdministratieRij {
  id: string;
  naam: string;
  soort: "ECHT" | "TEST";
  valuta: string;
  boekjaarStartMaand: number;
}

export async function administraties(): Promise<AdministratieRij[]> {
  const rijen = await prisma.boekAdministratie.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, naam: true, soort: true, valuta: true, boekjaarStartMaand: true },
  });
  return rijen.map((r) => ({ id: r.id, naam: r.naam, soort: r.soort, valuta: r.valuta, boekjaarStartMaand: r.boekjaarStartMaand }));
}

/** Debet en credit per rekening in de periode (alleen rekeningen met beweging). */
export async function proefbalans(administratieId: string, van: string, tot: string): Promise<ProefbalansRij[]> {
  controleerPeriode(van, tot);
  const groepen = await prisma.boekRegel.groupBy({
    by: ["rekeningId"],
    where: { boeking: { administratieId, datum: { gte: boekDatum(van), lte: boekDatum(tot) } } },
    _sum: { debetCents: true, creditCents: true },
  });
  const rekeningen = await prisma.boekRekening.findMany({
    where: { administratieId },
    select: { id: true, nummer: true, rgsCode: true, naam: true, soort: true },
  });
  return proefbalansRijen(
    rekeningen,
    groepen.map((g) => ({ rekeningId: g.rekeningId, debetCents: g._sum.debetCents ?? 0, creditCents: g._sum.creditCents ?? 0 })),
  );
}

export interface BoekingRegelRij {
  rekeningNummer: string;
  debetCents: number;
  creditCents: number;
  btwCode?: string;
  postSleutel?: string;
}

export interface BoekingRij {
  id: string;
  boekstuk: string;
  datum: string;
  dagboek: string;
  bron: string;
  bronId: string;
  omschrijving: string;
  heeftBijlage: boolean;
  regels: BoekingRegelRij[];
}

/** De boekingen in de periode, op datum en boekstuk; standaard hooguit 500 (maximaal 2000). */
export async function boekingen(administratieId: string, van: string, tot: string, limiet = 500): Promise<BoekingRij[]> {
  controleerPeriode(van, tot);
  const take = Math.min(Math.max(Math.trunc(limiet), 1), 2000);
  const rijen = await prisma.boekBoeking.findMany({
    where: { administratieId, datum: { gte: boekDatum(van), lte: boekDatum(tot) } },
    orderBy: [{ datum: "asc" }, { boekstuk: "asc" }],
    take,
    select: {
      id: true,
      boekstuk: true,
      datum: true,
      dagboek: true,
      bron: true,
      bronId: true,
      omschrijving: true,
      bon: { select: { id: true } },
      regels: {
        orderBy: { volgorde: "asc" },
        select: {
          debetCents: true,
          creditCents: true,
          postSleutel: true,
          rekening: { select: { nummer: true } },
          btwCode: { select: { code: true } },
        },
      },
    },
  });
  return rijen.map((b) => ({
    id: b.id,
    boekstuk: b.boekstuk,
    datum: dagVanDatumKolom(b.datum),
    dagboek: b.dagboek,
    bron: b.bron,
    bronId: b.bronId,
    omschrijving: b.omschrijving,
    heeftBijlage: b.bon !== null,
    regels: b.regels.map((r) => ({
      rekeningNummer: r.rekening.nummer,
      debetCents: r.debetCents,
      creditCents: r.creditCents,
      ...(r.btwCode ? { btwCode: r.btwCode.code } : {}),
      ...(r.postSleutel ? { postSleutel: r.postSleutel } : {}),
    })),
  }));
}

/** Open debiteuren en crediteuren op de peildatum (inclusief). */
export async function openPosten(administratieId: string, peildatum: string): Promise<OpenPost[]> {
  controleerDag(peildatum, "De peildatum");
  const regels = await prisma.boekRegel.findMany({
    where: { postSleutel: { not: null }, boeking: { administratieId, datum: { lte: boekDatum(peildatum) } } },
    select: {
      postSleutel: true,
      debetCents: true,
      creditCents: true,
      rekening: { select: { nummer: true, soort: true } },
      boeking: { select: { datum: true } },
    },
  });
  return openPostenUit(
    regels.flatMap((r) =>
      r.postSleutel === null
        ? []
        : [
            {
              postSleutel: r.postSleutel,
              rekeningNummer: r.rekening.nummer,
              rekeningSoort: r.rekening.soort,
              debetCents: r.debetCents,
              creditCents: r.creditCents,
              datum: dagVanDatumKolom(r.boeking.datum),
            },
          ],
    ),
    peildatum,
  );
}

/** Grondslag en btw per rubriek in de periode, uit de boekregels met een btw-code. Rubrieken: door accountant te bevestigen. */
export async function btwOverzicht(administratieId: string, van: string, tot: string): Promise<BtwOverzicht> {
  controleerPeriode(van, tot);
  const regels = await prisma.boekRegel.findMany({
    where: { btwCodeId: { not: null }, boeking: { administratieId, datum: { gte: boekDatum(van), lte: boekDatum(tot) } } },
    select: {
      debetCents: true,
      creditCents: true,
      isBtwRegel: true,
      btwBasisCents: true,
      btwCode: { select: { richting: true, grondslagRubriek: true, btwRubriek: true } },
    },
  });
  return btwOverzichtUit(
    regels.flatMap((r) =>
      r.btwCode === null
        ? []
        : [
            {
              debetCents: r.debetCents,
              creditCents: r.creditCents,
              isBtwRegel: r.isBtwRegel,
              btwBasisCents: r.btwBasisCents,
              richting: r.btwCode.richting,
              grondslagRubriek: r.btwCode.grondslagRubriek,
              btwRubriek: r.btwCode.btwRubriek,
            },
          ],
    ),
  );
}

/** Het btw-overzicht van een kwartaal (1-4). */
export async function btwOverzichtKwartaal(administratieId: string, jaar: number, kwartaal: number): Promise<BtwOverzicht> {
  const { van, tot } = kwartaalGrenzen(jaar, kwartaal);
  return btwOverzicht(administratieId, van, tot);
}

export interface BonZonderBoeking {
  id: string;
  status: string;
  /** de dag waarop de bon is geupload (Amsterdams) */
  geuploadOp: string;
  bonDatum?: string;
  totaalCents?: number;
  btwCents?: number;
  valuta?: string;
  evenKijkenReden?: string;
}

/** Bonnen die nog niet geboekt zijn (niet afgewezen), oudste eerst. Zonder leverancier en OCR-tekst. */
export async function bonnenZonderBoeking(administratieId: string): Promise<BonZonderBoeking[]> {
  const bonnen = await prisma.boekBon.findMany({
    where: { administratieId, boekingId: null, status: { not: "AFGEWEZEN" } },
    orderBy: { createdAt: "asc" },
    take: 500,
    select: { id: true, status: true, createdAt: true, bonDatum: true, totaalCents: true, btwCents: true, valuta: true, evenKijkenReden: true },
  });
  return bonnen.map((b) => ({
    id: b.id,
    status: b.status,
    geuploadOp: amsterdamDayKey(b.createdAt),
    ...(b.bonDatum ? { bonDatum: dagVanDatumKolom(b.bonDatum) } : {}),
    ...(b.totaalCents !== null ? { totaalCents: b.totaalCents } : {}),
    ...(b.btwCents !== null ? { btwCents: b.btwCents } : {}),
    ...(b.valuta ? { valuta: b.valuta } : {}),
    ...(b.evenKijkenReden ? { evenKijkenReden: b.evenKijkenReden } : {}),
  }));
}
