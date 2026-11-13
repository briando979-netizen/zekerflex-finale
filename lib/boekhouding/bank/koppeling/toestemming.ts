// ---------------------------------------------------------------------------
// Bank-koppeling: de toestemming bij de bank geven en vernieuwen (de eenmalige handeling van de eigenaar, daarna om de
// ~180 dagen opnieuw: PSD2 laat een toestemming niet langer duren). Twee stappen met een eenmalig state-token:
//   startToestemming -> de eigenaar gaat naar de link, logt in bij de bank en keurt goed in de bank-app
//   voltooiToestemming -> de bank stuurt hem terug met ?code&state; wij zetten de code om in een sessie.
// ---------------------------------------------------------------------------

import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { AANBIEDER_ENABLE_BANKING, type EnableBanking } from "./enable-banking";
import { BankKoppelingFout, type KoppelingStaat } from "./kern";
import { enableBankingUitOmgeving } from "./omgeving";
import { bewaarKoppelingStaat, leesKoppelingStaat, maakStateToken, neemStateToken, verzegelSessie } from "./opslag";
import { normaliseerIban } from "../tekst";

/** De namen zoals Enable Banking ze kent (te bevestigen met GET /aspsps bij de eerste echte koppeling). */
export const BANKEN = ["ING", "Rabobank", "ABN AMRO"] as const;
export type BankNaam = (typeof BANKEN)[number];

/** Iets onder het maximum van 180 dagen, zodat de bank de aanvraag niet weigert. */
export const GELDIG_DAGEN = 179;

export function isBankNaam(v: unknown): v is BankNaam {
  return typeof v === "string" && (BANKEN as readonly string[]).includes(v);
}

export function terugkeerUrl(basis: string): string {
  return `${basis.replace(/\/+$/, "")}/api/admin/boekhouding/bank/koppeling/terug`;
}

export async function startToestemming(o: { bankRekeningId: string; bank: BankNaam; door: string; basisUrl: string; eb?: EnableBanking; nu?: Date }): Promise<{ url: string }> {
  const rekening = await prisma.boekBankRekening.findUnique({ where: { id: o.bankRekeningId }, select: { id: true, actief: true } });
  if (!rekening) throw AppError.notFound("Deze bankrekening bestaat niet.");
  if (!rekening.actief) throw AppError.validation("Deze bankrekening is niet actief.");
  const eb = o.eb ?? enableBankingUitOmgeving();
  const nu = o.nu ?? new Date();
  const state = await maakStateToken({ bankRekeningId: o.bankRekeningId, bank: o.bank, door: o.door }, nu);
  try {
    return await eb.startToestemming({ bank: o.bank, geldigDagen: GELDIG_DAGEN, redirectUrl: terugkeerUrl(o.basisUrl), state });
  } catch (e) {
    if (e instanceof BankKoppelingFout) throw AppError.validation(e.message);
    throw e;
  }
}

/**
 * Rondt de toestemming af. De sessie moet een rekening hebben met precies het IBAN van deze bankrekening; anders
 * wordt er niets bewaard (de eigenaar koos bij de bank mogelijk de verkeerde rekening).
 */
export async function voltooiToestemming(o: { code: string; state: string; doorId: string; eb?: EnableBanking; nu?: Date }): Promise<{ bankRekeningId: string; geldigTot: string }> {
  const nu = o.nu ?? new Date();
  const wacht = await neemStateToken(o.state, nu);
  if (!wacht || wacht.door !== o.doorId) throw AppError.validation("Deze terugkeer van de bank hoort niet bij een lopende aanvraag of is te oud. Begin opnieuw bij Beheer, Boekhouding, Bank.");
  const rekening = await prisma.boekBankRekening.findUnique({ where: { id: wacht.bankRekeningId }, select: { iban: true } });
  if (!rekening) throw AppError.notFound("Deze bankrekening bestaat niet.");
  const eb = o.eb ?? enableBankingUitOmgeving();
  let sessie: Awaited<ReturnType<EnableBanking["rondToestemmingAf"]>>;
  try {
    sessie = await eb.rondToestemmingAf(o.code);
  } catch (e) {
    if (e instanceof BankKoppelingFout) throw AppError.validation(e.message);
    throw e;
  }
  const eigen = normaliseerIban(rekening.iban);
  const rek = sessie.rekeningen.find((r) => r.iban !== null && normaliseerIban(r.iban) === eigen);
  if (!rek) {
    logger.warn("bankkoppeling: de gekozen rekening bij de bank hoort niet bij deze bankrekening", { bankRekeningId: wacht.bankRekeningId, aantal: sessie.rekeningen.length });
    throw AppError.validation("Bij de bank is een andere rekening gekozen dan deze bankrekening. Begin opnieuw en kies bij de bank de rekening met het juiste IBAN.");
  }
  const vorige = await leesKoppelingStaat(wacht.bankRekeningId);
  const staat: KoppelingStaat = {
    aanbieder: AANBIEDER_ENABLE_BANKING,
    sessieVerzegeld: verzegelSessie(sessie.sessieId),
    rekeningUid: rek.uid,
    geldigTot: sessie.geldigTot,
    gekoppeldOp: nu.toISOString(),
    // een vernieuwing houdt de laatste ophaaldag, zodat er niets ontbreekt; de oude fout is dan opgelost
    laatsteSucces: vorige?.laatsteSucces ?? null,
    laatsteFout: null,
  };
  await bewaarKoppelingStaat(wacht.bankRekeningId, staat);
  return { bankRekeningId: wacht.bankRekeningId, geldigTot: sessie.geldigTot };
}
