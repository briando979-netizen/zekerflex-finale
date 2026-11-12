// ---------------------------------------------------------------------------
// Bonnen (uitgaven): een bon ontvangen, uitlezen en boeken of voor een mens klaarzetten. Zonder schermen.
//  1. ontvangBon: bestand controleren (magic bytes, 15 MB), op hash bewaren in storage/, BoekBon aanmaken, uitlezen,
//     de beslisregel toepassen. Boeken gebeurt ALLEEN via boek() (boekInTransactie, samen met het bijwerken van de bon);
//     twijfel is nooit een boeking: de bon wordt EVEN_KIJKEN met de reden erbij.
//  2. keurBonGoed / wijsBonAf: wat een mens daarna doet.
// Een bon wordt nooit gewist (bewaarplicht, zie bestand.ts). In logs alleen id's en statussen, nooit namen of tekst.
// ---------------------------------------------------------------------------

import type { BoekBonStatus, Prisma } from "@prisma/client";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { boekInTransactie } from "../boek";
import type { BoekContext } from "../inkomsten-kern";
import { boekDatum } from "../boekstuk";
import { beslisBon, vindDubbel, type BonSleutel, type Herkomst } from "./beslis";
import { bewaarBonKop, type BonKop } from "./bonkop";
import { bewaarTotVoor, bonBestandPad, valideerBonBestand } from "./bestand";
import { BON_BTW_CODES, BTW_CODE_INKOOP, bonRekeningNummers, bouwBonBoeking } from "./boeking";
import { schrijfBonBestand } from "./opslag";
import { standaardUitlezer, type UitleesUitkomst, type Uitlezer } from "./uitlezen";
import { berekenZekerheid, controleerBonVelden, type BonVelden, type DeelVelden, type RuweBonVelden } from "./velden";

export interface BonUitkomst {
  bonId: string;
  status: BoekBonStatus;
  /** false = dit bestand was al eerder aangeleverd: er is niets nieuws gebeurd */
  nieuw: boolean;
  /** het boekstuk als de bon is geboekt */
  boekstuk?: string;
  /** waarom de bon bij "even kijken" ligt, of wat er afwijkt */
  redenen: string[];
  /** het id van de bon waar dit een dubbele van is */
  dubbelVan?: string;
}

export interface OntvangOpties {
  administratieId: string;
  bytes: Buffer;
  bestandsnaam?: string | undefined;
  /** het id van de beheerder, of "mail" */
  geuploadDoor: string;
  herkomst: Herkomst;
  kop?: BonKop | undefined;
  betaaldMet?: "crediteuren" | "bank" | undefined;
  now?: Date | undefined;
  /** voor tests */
  uitlezer?: Uitlezer | undefined;
}

type Tx = Prisma.TransactionClient;

const korteReden = (redenen: readonly string[]) => redenen.join(" ").slice(0, 1000);

async function laadContext(
  db: Pick<Tx, "boekRekening" | "boekBtwCode">,
  administratieId: string,
  valuta: string,
  nummers: readonly string[],
): Promise<BoekContext> {
  const rekeningen = await db.boekRekening.findMany({
    where: { administratieId, nummer: { in: [...nummers] } },
    select: { id: true, nummer: true },
  });
  const codes = await db.boekBtwCode.findMany({ where: { administratieId, code: { in: [...BON_BTW_CODES] } }, select: { id: true, code: true } });
  const perNummer = new Map(rekeningen.map((r) => [r.nummer, r.id] as const));
  const perCode = new Map(codes.map((c) => [c.code, c.id] as const));
  return {
    administratieId,
    valuta,
    rekeningId: (nummer) => {
      const id = perNummer.get(nummer);
      if (!id) throw AppError.validation(`Rekening ${nummer} ontbreekt in deze administratie.`);
      return id;
    },
    btwCodeId: (code) => {
      const id = perCode.get(code);
      if (!id) throw AppError.validation(`Btw-code ${code} ontbreekt in deze administratie.`);
      return id;
    },
  };
}

async function zoekDubbel(administratieId: string, eigenId: string, sha256: string, deel: DeelVelden): Promise<BonSleutel | null> {
  if (deel.leverancier === undefined || deel.bonDatum === undefined || deel.totaalCents === undefined) return null;
  const rijen = await prisma.boekBon.findMany({
    where: {
      administratieId,
      id: { not: eigenId },
      status: { not: "AFGEWEZEN" },
      bonDatum: boekDatum(deel.bonDatum),
      totaalCents: deel.totaalCents,
    },
    select: { id: true, bestandSha256: true, leverancier: true, bonDatum: true, totaalCents: true },
    take: 50,
  });
  const bestaande: BonSleutel[] = rijen.map((r) => ({
    id: r.id,
    sha256: r.bestandSha256,
    leverancier: r.leverancier,
    bonDatum: r.bonDatum ? r.bonDatum.toISOString().slice(0, 10) : null,
    totaalCents: r.totaalCents,
  }));
  return vindDubbel({ sha256, leverancier: deel.leverancier, bonDatum: deel.bonDatum, totaalCents: deel.totaalCents }, bestaande);
}

/** De kolommen van BoekBon voor wat er uitgelezen is. */
function bonKolommen(deel: DeelVelden) {
  return {
    ...(deel.leverancier !== undefined ? { leverancier: deel.leverancier } : {}),
    ...(deel.factuurnummer !== undefined ? { leverancierNummer: deel.factuurnummer } : {}),
    ...(deel.bonDatum !== undefined ? { bonDatum: boekDatum(deel.bonDatum) } : {}),
    ...(deel.totaalCents !== undefined ? { totaalCents: deel.totaalCents } : {}),
    ...(deel.btwCents !== undefined ? { btwCents: deel.btwCents } : {}),
    ...(deel.valuta !== undefined ? { valuta: deel.valuta } : {}),
  };
}

async function zoekVoorstelIds(administratieId: string, deel: DeelVelden): Promise<{ voorstelRekeningId?: string; btwCodeId?: string }> {
  const uit: { voorstelRekeningId?: string; btwCodeId?: string } = {};
  if (deel.rekeningNummer !== undefined) {
    const r = await prisma.boekRekening.findFirst({ where: { administratieId, nummer: deel.rekeningNummer }, select: { id: true } });
    if (r) uit.voorstelRekeningId = r.id;
  }
  if (deel.btwPercentage !== undefined) {
    const code = BTW_CODE_INKOOP[deel.btwPercentage];
    const c = code ? await prisma.boekBtwCode.findFirst({ where: { administratieId, code }, select: { id: true } }) : null;
    if (c) uit.btwCodeId = c.id;
  }
  return uit;
}

/** Boekt de bon en zet hem op GEBOEKT, in een transactie. Gooit bij een fout (de bon blijft dan ongewijzigd). */
async function boekBon(
  bon: { id: string; administratieId: string; bestandSha256: string },
  velden: BonVelden,
  deel: DeelVelden,
  administratieValuta: string,
  opties: { betaaldMet?: "crediteuren" | "bank" | undefined; aangemaaktDoor: string },
): Promise<string> {
  const resultaat = await prisma.$transaction(async (tx) => {
    const ctx = await laadContext(tx, bon.administratieId, administratieValuta, bonRekeningNummers(velden));
    const invoer = bouwBonBoeking(velden, ctx, {
      bonId: bon.id,
      sha256: bon.bestandSha256,
      betaaldMet: opties.betaaldMet,
      aangemaaktDoor: opties.aangemaaktDoor,
    });
    const r = await boekInTransactie(tx, invoer);
    await tx.boekBon.update({
      where: { id: bon.id },
      data: {
        status: "GEBOEKT",
        boekingId: r.boekingId,
        evenKijkenReden: null,
        ...bonKolommen(deel),
        btwCodeId: ctx.btwCodeId(BTW_CODE_INKOOP[velden.btwPercentage]!),
        voorstelRekeningId: ctx.rekeningId(velden.rekeningNummer),
      },
    });
    return r;
  });
  return resultaat.boekstuk;
}

/**
 * Een bon ontvangen (upload of mail): bewaren, uitlezen en boeken of voor een mens klaarzetten. Dezelfde bytes twee
 * keer aanleveren geeft dezelfde bon terug (nieuw: false). Gooit alleen bij een ongeldig bestand of een ontbrekende
 * administratie; elk probleem bij het uitlezen wordt een reden bij "even kijken".
 */
export async function ontvangBon(o: OntvangOpties): Promise<BonUitkomst> {
  const now = o.now ?? new Date();
  const bestand = valideerBonBestand(o.bytes, o.bestandsnaam);
  const administratie = await prisma.boekAdministratie.findUnique({
    where: { id: o.administratieId },
    select: { id: true, valuta: true, actief: true },
  });
  if (!administratie) throw AppError.notFound("Deze administratie bestaat niet.");
  if (!administratie.actief) throw AppError.validation("Deze administratie is niet actief: er komen geen bonnen meer bij.");

  const bestaand = () =>
    prisma.boekBon.findUnique({
      where: { administratieId_bestandSha256: { administratieId: o.administratieId, bestandSha256: bestand.sha256 } },
      select: { id: true, status: true, evenKijkenReden: true },
    });
  const al = await bestaand();
  if (al) return { bonId: al.id, status: al.status, nieuw: false, redenen: al.evenKijkenReden ? [al.evenKijkenReden] : [], dubbelVan: al.id };

  const pad = bonBestandPad(o.administratieId, bestand.sha256, bestand.ext);
  await schrijfBonBestand(pad, o.bytes);
  let bon: { id: string; administratieId: string; bestandSha256: string };
  try {
    bon = await prisma.boekBon.create({
      data: {
        administratieId: o.administratieId,
        bestandPad: pad,
        bestandSha256: bestand.sha256,
        mimeType: bestand.mimeType,
        bytes: bestand.bytes,
        geuploadDoor: o.geuploadDoor,
        bewaarTot: bewaarTotVoor(amsterdamDayKey(now)),
      },
      select: { id: true, administratieId: true, bestandSha256: true },
    });
  } catch (e) {
    if (typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002") {
      const nu = await bestaand();
      if (nu) return { bonId: nu.id, status: nu.status, nieuw: false, redenen: [], dubbelVan: nu.id };
    }
    throw e;
  }
  if (o.kop) await bewaarBonKop(bon.id, o.kop).catch(() => undefined);

  // Uitlezen: nooit een gooi, een fout is een reden.
  const uitlezer = o.uitlezer ?? standaardUitlezer;
  let uit: UitleesUitkomst;
  try {
    uit = await uitlezer(o.bytes, bestand);
  } catch {
    uit = { tekst: null, ocrVertrouwen: null, ruw: {}, modelPromille: null, modelNaam: null, problemen: ["Het uitlezen van de bon is mislukt."] };
  }
  const controle = controleerBonVelden(uit.ruw, { now, tekst: uit.tekst ?? undefined });
  const problemen = uit.problemen.length > 0 ? uit.problemen : controle.problemen;
  const velden = uit.problemen.length > 0 ? null : controle.velden;
  const zekerheid = berekenZekerheid({ modelPromille: uit.modelPromille, ocrVertrouwen: uit.ocrVertrouwen, problemen });
  const ids = await zoekVoorstelIds(o.administratieId, controle.deel).catch(() => ({}));

  await prisma.boekBon.update({
    where: { id: bon.id },
    data: {
      status: "GELEZEN",
      ...bonKolommen(controle.deel),
      ...ids,
      zekerheidPromille: zekerheid,
      ...(uit.modelNaam ? { modelNaam: uit.modelNaam } : {}),
      ...(uit.tekst ? { ocrTekst: uit.tekst.slice(0, 50_000) } : {}),
    },
  });

  const dubbelVan = await zoekDubbel(o.administratieId, bon.id, bestand.sha256, controle.deel);
  const beslissing = beslisBon({
    velden,
    problemen,
    zekerheidPromille: zekerheid,
    herkomst: o.herkomst,
    dubbel: dubbelVan !== null,
    administratieValuta: administratie.valuta,
  });

  if (beslissing.actie === "dubbel" && dubbelVan) {
    await prisma.boekBon.update({ where: { id: bon.id }, data: { status: "AFGEWEZEN", afwijsReden: `Dubbel van bon ${dubbelVan.id} (zelfde leverancier, datum en bedrag).` } });
    logger.info("bon dubbel", { bonId: bon.id, van: dubbelVan.id });
    return { bonId: bon.id, status: "AFGEWEZEN", nieuw: true, redenen: ["Dubbele bon."], dubbelVan: dubbelVan.id };
  }

  let redenen: string[] = beslissing.actie === "even-kijken" ? beslissing.redenen : [];
  if (beslissing.actie === "boeken" && velden !== null) {
    try {
      const boekstuk = await boekBon(bon, velden, controle.deel, administratie.valuta, {
        betaaldMet: o.betaaldMet,
        aangemaaktDoor: "systeem",
      });
      logger.info("bon geboekt", { bonId: bon.id });
      return { bonId: bon.id, status: "GEBOEKT", nieuw: true, boekstuk, redenen: [] };
    } catch (e) {
      // bv. een vergrendelde periode of een ontbrekende rekening: geen boeking, een mens kijkt
      redenen = [e instanceof AppError ? e.message : "Het boeken is mislukt."];
    }
  }
  await prisma.boekBon.update({ where: { id: bon.id }, data: { status: "EVEN_KIJKEN", evenKijkenReden: korteReden(redenen) } });
  logger.info("bon even kijken", { bonId: bon.id });
  return { bonId: bon.id, status: "EVEN_KIJKEN", nieuw: true, redenen };
}

export interface GoedkeurOpties {
  /** het id van de beheerder die de bon nakeek */
  door: string;
  betaaldMet?: "crediteuren" | "bank" | undefined;
  /** ja, ik weet dat er een bon met dezelfde leverancier, datum en bedrag is */
  ondanksDubbel?: boolean | undefined;
  now?: Date | undefined;
}

/** Een mens boekt een bon die bij "even kijken" lag, met de (eventueel verbeterde) velden. Geeft het boekstuk. */
export async function keurBonGoed(bonId: string, velden: RuweBonVelden, opties: GoedkeurOpties): Promise<{ boekstuk: string }> {
  const bon = await prisma.boekBon.findUnique({
    where: { id: bonId },
    select: { id: true, administratieId: true, status: true, bestandSha256: true, administratie: { select: { valuta: true, actief: true } } },
  });
  if (!bon) throw AppError.notFound("Deze bon bestaat niet.");
  if (bon.status === "GEBOEKT") throw AppError.validation("Deze bon is al geboekt.");
  if (bon.status === "AFGEWEZEN") throw AppError.validation("Deze bon is afgewezen en wordt niet meer geboekt.");
  if (!bon.administratie.actief) throw AppError.validation("Deze administratie is niet actief: er wordt niet meer in geboekt.");

  // Een mens is de autoriteit: de controle op het totaal in de OCR-tekst telt niet mee, de sommen en de datum wel.
  const controle = controleerBonVelden(velden, { now: opties.now ?? new Date() });
  if (controle.velden === null) throw AppError.validation(controle.problemen.join(" "));

  if (!opties.ondanksDubbel) {
    const dubbel = await zoekDubbel(bon.administratieId, bon.id, bon.bestandSha256, controle.deel);
    if (dubbel) {
      throw AppError.validation(`Er is al een bon met dezelfde leverancier, datum en bedrag (bon ${dubbel.id}). Bevestig dat het toch een aparte bon is.`);
    }
  }
  const boekstuk = await boekBon(bon, controle.velden, controle.deel, bon.administratie.valuta, {
    betaaldMet: opties.betaaldMet,
    aangemaaktDoor: opties.door,
  });
  logger.info("bon goedgekeurd", { bonId: bon.id });
  return { boekstuk };
}

/** Een mens wijst een bon af (geen bon, niet voor ons, ...). Een geboekte bon corrigeer je met keerOm op de boeking. */
export async function wijsBonAf(bonId: string, reden: string, door: string): Promise<void> {
  const schoon = reden.trim();
  if (schoon.length < 3) throw AppError.validation("Geef een reden voor het afwijzen.");
  if (schoon.length > 500) throw AppError.validation("De reden is te lang (hooguit 500 tekens).");
  const bon = await prisma.boekBon.findUnique({ where: { id: bonId }, select: { id: true, status: true } });
  if (!bon) throw AppError.notFound("Deze bon bestaat niet.");
  if (bon.status === "GEBOEKT") throw AppError.validation("Deze bon is al geboekt. Maak de boeking ongedaan met een tegenboeking.");
  if (bon.status === "AFGEWEZEN") return;
  await prisma.boekBon.update({ where: { id: bonId }, data: { status: "AFGEWEZEN", afwijsReden: schoon } });
  logger.info("bon afgewezen", { bonId, door });
}
