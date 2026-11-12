// ---------------------------------------------------------------------------
// Bank: een afschrift importeren (datalaag, met prisma). Idempotent: hetzelfde bestand twee keer geeft hetzelfde afschrift
// terug; overlappende periodes geven nooit dubbele transacties (unieke sleutel per rekening, zie lees.ts: dedupeSleutels).
// Het bestand wordt bewaard op het opslagvolume. AVG: naam en IBAN van tegenpartijen staan ALLEEN in BoekBankTransactie
// (en het bestand); ze horen bij de administratie van het platform en vallen onder de bewaarplicht van 7 jaar. In logs
// en het auditspoor alleen id's en aantallen. Het IBAN van de eigen rekening wordt in het scherm gemaskeerd.
// ---------------------------------------------------------------------------

import type { Prisma } from "@prisma/client";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { boekDatum } from "../boekstuk";
import { bestandExtensie, dedupeSleutels, leesBankBestand, sha256Bytes } from "./lees";
import { verwerkNieuweTransacties } from "./matching";
import { bankBestandPad, schrijfBankBestand } from "./opslag";
import { maskeerIban, normaliseerIban } from "./tekst";
import type { ImportUitkomst, VerwerkUitkomst } from "./types";

export interface ImportOpties {
  bankRekeningId: string;
  bytes: Buffer;
  /** het id van de beheerder */
  door: string;
}

function isUniekeBotsing(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002";
}

export async function importeerAfschrift(o: ImportOpties): Promise<ImportUitkomst> {
  const rekening = await prisma.boekBankRekening.findUnique({
    where: { id: o.bankRekeningId },
    select: { id: true, administratieId: true, iban: true, valuta: true, actief: true, administratie: { select: { actief: true } } },
  });
  if (!rekening) throw AppError.notFound("Deze bankrekening bestaat niet.");
  if (!rekening.actief || !rekening.administratie.actief) throw AppError.validation("Deze bankrekening of administratie is niet actief: er worden geen afschriften meer ingelezen.");

  const data = leesBankBestand(o.bytes);
  if (data.rekeningIban && data.rekeningIban !== normaliseerIban(rekening.iban)) {
    throw AppError.validation(
      `Dit afschrift hoort bij een andere bankrekening (eindigt op ${maskeerIban(data.rekeningIban).slice(-4)}) dan de gekozen rekening (eindigt op ${maskeerIban(rekening.iban).slice(-4)}). Kies de juiste rekening.`,
    );
  }
  if (data.valuta !== rekening.valuta || data.transacties.some((t) => t.valuta !== rekening.valuta)) {
    throw AppError.validation(`Dit afschrift is niet (alleen) in ${rekening.valuta}, de munt van deze rekening. Lees het afschrift in op een rekening in de juiste munt.`);
  }

  const sha = sha256Bytes(o.bytes);
  const bestaand = await prisma.boekBankAfschrift.findUnique({
    where: { bankRekeningId_bestandSha256: { bankRekeningId: rekening.id, bestandSha256: sha } },
    select: { id: true, formaat: true },
  });
  const basis = { herkend: data.herkend, formaat: data.formaat, totaal: data.transacties.length, waarschuwingen: data.waarschuwingen };
  if (bestaand) {
    return { ...basis, afschriftId: bestaand.id, alIngelezen: true, nieuw: 0, alBekend: data.transacties.length, verwerkt: null };
  }

  const pad = bankBestandPad(rekening.administratieId, sha, bestandExtensie(data));
  await schrijfBankBestand(pad, o.bytes);

  const sleutels = dedupeSleutels(normaliseerIban(rekening.iban), data.transacties);
  let afschriftId: string;
  let nieuw = 0;
  try {
    const uit = await prisma.$transaction(
      async (tx) => {
        const afschrift = await tx.boekBankAfschrift.create({
          data: {
            bankRekeningId: rekening.id,
            formaat: data.formaat,
            bestandPad: pad,
            bestandSha256: sha,
            geuploadDoor: o.door,
            ...(data.afschriftNummer ? { afschriftNummer: data.afschriftNummer } : {}),
            ...(data.vanaf ? { vanaf: boekDatum(data.vanaf) } : {}),
            ...(data.totEnMet ? { totEnMet: boekDatum(data.totEnMet) } : {}),
            ...(data.beginSaldoCents !== null ? { beginSaldoCents: data.beginSaldoCents } : {}),
            ...(data.eindSaldoCents !== null ? { eindSaldoCents: data.eindSaldoCents } : {}),
          },
          select: { id: true },
        });
        let aantal = 0;
        for (let i = 0; i < data.transacties.length; i += 1000) {
          const stuk: Prisma.BoekBankTransactieCreateManyInput[] = data.transacties.slice(i, i + 1000).map((t, j) => ({
            bankRekeningId: rekening.id,
            afschriftId: afschrift.id,
            boekdatum: boekDatum(t.boekdag),
            bedragCents: t.bedragCents,
            valuta: t.valuta,
            dedupeSleutel: sleutels[i + j] as string,
            ...(t.valutadag ? { valutadatum: boekDatum(t.valutadag) } : {}),
            ...(t.tegenIban ? { tegenIban: t.tegenIban } : {}),
            ...(t.tegenNaam ? { tegenNaam: t.tegenNaam } : {}),
            ...(t.omschrijving ? { omschrijving: t.omschrijving } : {}),
            ...(t.endToEndId ? { endToEndId: t.endToEndId } : {}),
          }));
          const r = await tx.boekBankTransactie.createMany({ data: stuk, skipDuplicates: true });
          aantal += r.count;
        }
        return { id: afschrift.id, aantal };
      },
      { timeout: 120_000, maxWait: 20_000 },
    );
    afschriftId = uit.id;
    nieuw = uit.aantal;
  } catch (e) {
    // Twee gelijktijdige uploads van hetzelfde bestand: de tweede ziet het afschrift van de eerste.
    if (isUniekeBotsing(e)) {
      const nu = await prisma.boekBankAfschrift.findUnique({
        where: { bankRekeningId_bestandSha256: { bankRekeningId: rekening.id, bestandSha256: sha } },
        select: { id: true },
      });
      if (nu) return { ...basis, afschriftId: nu.id, alIngelezen: true, nieuw: 0, alBekend: data.transacties.length, verwerkt: null };
    }
    throw e;
  }

  let verwerkt: VerwerkUitkomst | null = null;
  const waarschuwingen = [...data.waarschuwingen];
  try {
    verwerkt = await verwerkNieuweTransacties(rekening.administratieId, { bankRekeningId: rekening.id, door: o.door });
  } catch (e) {
    logger.warn("banktransacties koppelen na het inlezen mislukt", { afschriftId, fout: e instanceof Error ? e.name : "onbekend" });
    waarschuwingen.push("De transacties zijn ingelezen, maar het zoeken naar facturen en bonnen is niet gelukt. Kies later Opnieuw zoeken.");
  }
  logger.info("bankafschrift ingelezen", { afschriftId, totaal: data.transacties.length, nieuw });
  return { ...basis, waarschuwingen, afschriftId, alIngelezen: false, nieuw, alBekend: data.transacties.length - nieuw, verwerkt };
}
