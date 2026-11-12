// ---------------------------------------------------------------------------
// Btw-concept: de datalaag. Leest de boekregels van een kwartaal, rekent de rubrieken uit, controleert en bewaart een
// onveranderlijke momentopname (BoekBtwAangifte, nieuwe versie per aanroep). Het systeem dient NOOIT zelf in en stuurt
// niets naar de Belastingdienst: "ingediend" markeert alleen dat een MENS het zelf heeft gedaan. Er worden hier geen
// boekingen geschreven. In de momentopname staan geen persoonsgegevens (alleen bedragen, id's en vaste teksten).
//
// Statussen: BEREKEND = concept, GOEDGEKEURD = klaar om in te dienen, INGEDIEND, VERVANGEN (er is een nieuwere versie).
// De database laat na het aanmaken alleen status- en indienvelden wijzigen (trigger in de migratie).
// ---------------------------------------------------------------------------

import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { boekDatum } from "../boekstuk";
import { REKENING_TE_BETALEN_BTW } from "../inkomsten-kern";
import { bonnenZonderBoeking } from "../lezen";
import { dagVanDatumKolom, kwartaalGrenzen } from "../lezen-kern";
import { isGeldigeBoekdag } from "../sluiting";
import { heeftBlokkade, controleerBtw, type ControleBonBoeking, type ControleRegel } from "./controle";
import { berekenBtw, btwDeadlineDag } from "./kern";
import { STATUS_TEKST, type BtwConceptInhoud, type BtwConceptRij } from "./labels";

const REKENING_VOORBELASTING_BTW = "1300";
const MIN_REDEN = 10;
const MAX_REDEN = 500;

export type { BtwConceptRij } from "./labels";

interface AangifteMetPeriode {
  id: string;
  versie: number;
  status: string;
  rubrieken: unknown;
  totaalTeBetalenCents: number;
  berekendOp: Date;
  goedgekeurdOp: Date | null;
  ingediendOp: Date | null;
  indieningReferentie: string | null;
  periode: { administratieId: string; jaar: number; kwartaal: number; deadline: Date };
}

const SELECT_AANGIFTE = {
  id: true,
  versie: true,
  status: true,
  rubrieken: true,
  totaalTeBetalenCents: true,
  berekendOp: true,
  goedgekeurdOp: true,
  ingediendOp: true,
  indieningReferentie: true,
  periode: { select: { administratieId: true, jaar: true, kwartaal: true, deadline: true } },
} as const;

function naarRij(a: AangifteMetPeriode): BtwConceptRij {
  const status = a.status as BtwConceptRij["status"];
  return {
    id: a.id,
    administratieId: a.periode.administratieId,
    jaar: a.periode.jaar,
    kwartaal: a.periode.kwartaal,
    versie: a.versie,
    status,
    statusTekst: STATUS_TEKST[status] ?? status,
    berekendOp: a.berekendOp.toISOString(),
    goedgekeurdOp: a.goedgekeurdOp ? a.goedgekeurdOp.toISOString() : null,
    ingediendOp: a.ingediendOp ? amsterdamDayKey(a.ingediendOp) : null,
    indieningReferentie: a.indieningReferentie,
    deadline: dagVanDatumKolom(a.periode.deadline),
    saldoCents: a.totaalTeBetalenCents,
    inhoud: a.rubrieken as BtwConceptInhoud,
  };
}

/** Hash over de inhoud, met vaste sleutelvolgorde door de vaste opbouw van het object. */
export function snapshotHash(inhoud: BtwConceptInhoud): string {
  return createHash("sha256").update(JSON.stringify(inhoud)).digest("hex");
}

function isDubbeleSleutel(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002";
}

/** De regels van het kwartaal voor berekening en controle, en de gegevens die de controle verder nodig heeft. */
async function leesInvoer(administratieId: string, van: string, tot: string) {
  const bereik = { gte: boekDatum(van), lte: boekDatum(tot) };
  const [regels, rekeningRegels, bonnen, bonBoekingen] = await Promise.all([
    prisma.boekRegel.findMany({
      where: {
        boeking: { administratieId, datum: bereik },
        OR: [{ btwCodeId: { not: null } }, { rekening: { soort: { in: ["OMZET", "KOSTEN"] } } }],
      },
      select: {
        boekingId: true,
        debetCents: true,
        creditCents: true,
        isBtwRegel: true,
        btwBasisCents: true,
        rekening: { select: { soort: true } },
        btwCode: { select: { code: true, richting: true, tariefBasispunten: true, grondslagRubriek: true, btwRubriek: true } },
      },
    }),
    prisma.boekRegel.findMany({
      where: { boeking: { administratieId, datum: bereik }, rekening: { nummer: { in: [REKENING_TE_BETALEN_BTW, REKENING_VOORBELASTING_BTW] } } },
      select: { debetCents: true, creditCents: true },
    }),
    bonnenZonderBoeking(administratieId),
    prisma.boekBon.findMany({
      where: {
        administratieId,
        boekingId: { not: null },
        bonDatum: { not: null },
        boeking: { is: { regels: { some: { btwCodeId: { not: null } } } } },
      },
      select: { id: true, bonDatum: true, boeking: { select: { id: true, datum: true } } },
    }),
  ]);

  const controleRegels: ControleRegel[] = regels.map((r) => ({
    boekingId: r.boekingId,
    rekeningSoort: r.rekening.soort,
    debetCents: r.debetCents,
    creditCents: r.creditCents,
    isBtwRegel: r.isBtwRegel,
    btwBasisCents: r.btwBasisCents,
    btwCode: r.btwCode ? r.btwCode.code : null,
    tariefBasispunten: r.btwCode ? r.btwCode.tariefBasispunten : null,
    richting: r.btwCode ? r.btwCode.richting : null,
  }));
  const btwRegels = regels.flatMap((r) =>
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
  );

  // te betalen btw (credit min debet) min te vorderen btw (debet min credit) = voor beide rekeningen credit min debet
  const rekeningSaldoCents = rekeningRegels.reduce((s, r) => s + r.creditCents - r.debetCents, 0);

  const bonBoekingenLijst: ControleBonBoeking[] = bonBoekingen.flatMap((b) =>
    b.bonDatum && b.boeking ? [{ boekingId: b.boeking.id, bonId: b.id, boekDatum: dagVanDatumKolom(b.boeking.datum), bonDatum: dagVanDatumKolom(b.bonDatum) }] : [],
  );

  return {
    btwRegels,
    controleRegels,
    rekeningSaldoCents,
    bonnenZonderBoeking: bonnen.map((b) => ({ id: b.id, status: b.status, geuploadOp: b.geuploadOp, bonDatum: b.bonDatum })),
    bonBoekingen: bonBoekingenLijst,
  };
}

/**
 * Maakt een nieuw btw-concept voor een kwartaal en bewaart het als nieuwe versie (status BEREKEND). Een eerdere versie
 * die nog niet is ingediend wordt VERVANGEN. Een ingediende versie blijft staan (een correctie na indienen is werk voor
 * een accountant). Geeft de nieuwe versie terug.
 */
export async function maakBtwConcept(administratieId: string, jaar: number, kwartaal: number, nu: Date = new Date()): Promise<BtwConceptRij> {
  const { van, tot } = kwartaalGrenzen(jaar, kwartaal);
  const administratie = await prisma.boekAdministratie.findUnique({ where: { id: administratieId }, select: { id: true, btwPlichtig: true } });
  if (!administratie) throw AppError.notFound("Deze administratie bestaat niet.");

  const invoer = await leesInvoer(administratieId, van, tot);
  const berekening = berekenBtw(invoer.btwRegels);
  const meldingen = controleerBtw({
    van,
    tot,
    vandaag: amsterdamDayKey(nu),
    btwPlichtig: administratie.btwPlichtig,
    berekening,
    regels: invoer.controleRegels,
    rekeningSaldoCents: invoer.rekeningSaldoCents,
    bonnenZonderBoeking: invoer.bonnenZonderBoeking,
    bonBoekingen: invoer.bonBoekingen,
  });
  const inhoud: BtwConceptInhoud = {
    formaat: 1,
    jaar,
    kwartaal,
    van,
    tot,
    rubrieken: berekening.rubrieken,
    verschuldigdCents: berekening.verschuldigdCents,
    voorbelastingCents: berekening.voorbelastingCents,
    saldoCents: berekening.saldoCents,
    voorbehouden: berekening.voorbehouden,
    meldingen,
  };
  const deadline = btwDeadlineDag(jaar, kwartaal) ?? tot;

  for (let poging = 0; poging < 2; poging++) {
    try {
      const gemaakt = await prisma.$transaction(async (tx) => {
        const periode = await tx.boekBtwPeriode.upsert({
          where: { administratieId_jaar_kwartaal: { administratieId, jaar, kwartaal } },
          create: { administratieId, jaar, kwartaal, vanaf: boekDatum(van), totEnMet: boekDatum(tot), deadline: boekDatum(deadline) },
          update: {},
          select: { id: true },
        });
        const laatste = await tx.boekBtwAangifte.findFirst({ where: { periodeId: periode.id }, orderBy: { versie: "desc" }, select: { versie: true } });
        await tx.boekBtwAangifte.updateMany({ where: { periodeId: periode.id, status: { in: ["BEREKEND", "GOEDGEKEURD"] } }, data: { status: "VERVANGEN" } });
        return tx.boekBtwAangifte.create({
          data: {
            periodeId: periode.id,
            versie: (laatste?.versie ?? 0) + 1,
            status: "BEREKEND",
            rubrieken: inhoud as unknown as Prisma.InputJsonValue,
            totaalTeBetalenCents: inhoud.saldoCents,
            snapshotHash: snapshotHash(inhoud),
            berekendOp: nu,
          },
          select: SELECT_AANGIFTE,
        });
      });
      return naarRij(gemaakt);
    } catch (e) {
      if (poging === 0 && isDubbeleSleutel(e)) continue;
      throw e;
    }
  }
  throw AppError.conflict("Er werd tegelijk een ander concept gemaakt. Probeer het opnieuw.");
}

/** De nieuwste versie van een kwartaal (of null als er nog geen concept is) en hoeveel versies er zijn. */
export async function leesBtwConcept(administratieId: string, jaar: number, kwartaal: number): Promise<{ laatste: BtwConceptRij | null; versies: number; deadline: string | null }> {
  kwartaalGrenzen(jaar, kwartaal);
  const periode = await prisma.boekBtwPeriode.findUnique({
    where: { administratieId_jaar_kwartaal: { administratieId, jaar, kwartaal } },
    select: { id: true },
  });
  const deadline = btwDeadlineDag(jaar, kwartaal);
  if (!periode) return { laatste: null, versies: 0, deadline };
  const [laatste, versies] = await Promise.all([
    prisma.boekBtwAangifte.findFirst({ where: { periodeId: periode.id }, orderBy: { versie: "desc" }, select: SELECT_AANGIFTE }),
    prisma.boekBtwAangifte.count({ where: { periodeId: periode.id } }),
  ]);
  return { laatste: laatste ? naarRij(laatste) : null, versies, deadline };
}

export async function btwConceptOpId(id: string): Promise<BtwConceptRij> {
  const a = await prisma.boekBtwAangifte.findUnique({ where: { id }, select: SELECT_AANGIFTE });
  if (!a) throw AppError.notFound("Dit btw-concept bestaat niet.");
  return naarRij(a);
}

export interface KlaarUitkomst {
  concept: BtwConceptRij;
  /** de beheerder heeft blokkerende meldingen uitdrukkelijk overschreven */
  overschreven: boolean;
  reden?: string;
}

/**
 * Zet een concept op "klaar om in te dienen". Alleen de nieuwste, nog niet vervangen versie. Staat er een blokkerende
 * melding in, dan lukt het alleen met een uitdrukkelijke reden van de beheerder (`overschrijfReden`, minstens 10 tekens).
 */
export async function markeerKlaarVoorIndienen(id: string, door: string, overschrijfReden?: string): Promise<KlaarUitkomst> {
  const huidig = await btwConceptOpId(id);
  if (huidig.status === "INGEDIEND") throw AppError.conflict("Dit concept is al ingediend.");
  if (huidig.status === "VERVANGEN") throw AppError.conflict("Er is een nieuwere versie van dit concept. Gebruik de nieuwste.");
  if (huidig.status === "GOEDGEKEURD") throw AppError.conflict("Dit concept staat al klaar om in te dienen.");

  const blokkades = huidig.inhoud.meldingen.filter((m) => m.ernst === "blokkeert");
  const reden = overschrijfReden?.trim();
  if (heeftBlokkade(huidig.inhoud.meldingen)) {
    if (!reden || reden.length < MIN_REDEN) {
      throw AppError.validation(
        `Er staan nog ${blokkades.length} ${blokkades.length === 1 ? "punt" : "punten"} die eerst opgelost moeten worden. Los ze op en maak een nieuw concept, of geef uitdrukkelijk een reden (minstens ${MIN_REDEN} tekens) waarom je toch doorgaat.`,
      );
    }
    if (reden.length > MAX_REDEN) throw AppError.validation(`De reden is te lang (hooguit ${MAX_REDEN} tekens).`);
  }

  const nu = new Date();
  const res = await prisma.boekBtwAangifte.updateMany({ where: { id, status: "BEREKEND" }, data: { status: "GOEDGEKEURD", goedgekeurdOp: nu, goedgekeurdDoor: door } });
  if (res.count !== 1) throw AppError.conflict("Dit concept is net door iemand anders gewijzigd. Laad de pagina opnieuw.");
  const concept = await btwConceptOpId(id);
  return { concept, overschreven: blokkades.length > 0, ...(blokkades.length > 0 && reden ? { reden } : {}) };
}

export interface IndienInvoer {
  /** de dag waarop de mens heeft ingediend, "2026-05-02" */
  ingediendOp: string;
  /** de bevestiging van de Belastingdienst (bijvoorbeeld het ontvangstnummer) */
  referentie: string;
}

/**
 * Legt vast dat een MENS het concept zelf heeft ingediend (Mijn Belastingdienst Zakelijk of via een accountant).
 * Dit verstuurt niets. Alleen vanuit "klaar om in te dienen".
 */
export async function markeerIngediend(id: string, invoer: IndienInvoer, nu: Date = new Date()): Promise<BtwConceptRij> {
  const dag = invoer.ingediendOp.trim();
  if (!isGeldigeBoekdag(dag)) throw AppError.validation("De datum van indienen is geen geldige dag (verwacht: JJJJ-MM-DD).");
  if (dag > amsterdamDayKey(nu)) throw AppError.validation("De datum van indienen ligt in de toekomst.");
  const referentie = invoer.referentie.trim();
  if (referentie.length < 3) throw AppError.validation("Vul de referentie of het ontvangstnummer van de Belastingdienst in (minstens 3 tekens).");
  if (referentie.length > 100) throw AppError.validation("De referentie is te lang (hooguit 100 tekens).");

  const huidig = await btwConceptOpId(id);
  if (huidig.status === "INGEDIEND") throw AppError.conflict("Dit concept is al als ingediend gemarkeerd.");
  if (huidig.status !== "GOEDGEKEURD") throw AppError.conflict("Zet het concept eerst op 'klaar om in te dienen' voordat je markeert dat je het hebt ingediend.");

  const res = await prisma.boekBtwAangifte.updateMany({
    where: { id, status: "GOEDGEKEURD" },
    data: { status: "INGEDIEND", ingediendOp: boekDatum(dag), indieningReferentie: referentie },
  });
  if (res.count !== 1) throw AppError.conflict("Dit concept is net door iemand anders gewijzigd. Laad de pagina opnieuw.");
  return btwConceptOpId(id);
}
