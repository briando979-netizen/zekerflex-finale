// ---------------------------------------------------------------------------
// Bonnen: van een gecontroleerde bon naar een inkoopboeking (puur, zonder prisma). Kosten debet (grondslag), te
// vorderen btw debet, en credit op crediteuren (nog te betalen) of bank (al betaald). Bron "BON", bronId = het id van
// de bon: boek() boekt dezelfde bon dus nooit twee keer. De omschrijving is "Bon B-2026-3F9A12CD": nooit de naam van
// de leverancier (die staat alleen op de BoekBon).
// ---------------------------------------------------------------------------

import { AppError } from "@/lib/errors";
import type { BoekContext } from "../inkomsten-kern";
import { omschrijvingVoor } from "../omschrijving";
import type { BoekInvoer, RegelInvoer } from "../types";
import { bonNummerVoor, type BonVelden } from "./velden";

export const REKENING_VOORBELASTING = "1300";
export const REKENING_CREDITEUREN = "2200";
export const REKENING_BANK = "1100";

export const BTW_CODE_INKOOP: Readonly<Record<number, string>> = {
  21: "NL21-I",
  9: "NL09-I",
  0: "NL00-I",
};

/** De btw-codes en rekeningnummers die een bonboeking nodig heeft; voor de administratie opzoeken. */
export function bonRekeningNummers(velden: Pick<BonVelden, "rekeningNummer">): string[] {
  return [velden.rekeningNummer, REKENING_VOORBELASTING, REKENING_CREDITEUREN, REKENING_BANK];
}

export const BON_BTW_CODES: readonly string[] = [BTW_CODE_INKOOP[21]!, BTW_CODE_INKOOP[9]!, BTW_CODE_INKOOP[0]!];

export interface BonBoekOpties {
  bonId: string;
  sha256: string;
  /** standaard nog te betalen: de betaling komt later via de bank */
  betaaldMet?: "crediteuren" | "bank" | undefined;
  aangemaaktDoor?: string | undefined;
}

export function postSleutelVoorBon(bonId: string): string {
  return `bon:${bonId}`;
}

export function bouwBonBoeking(velden: BonVelden, ctx: BoekContext, opties: BonBoekOpties): BoekInvoer {
  const code = Object.hasOwn(BTW_CODE_INKOOP, velden.btwPercentage) ? BTW_CODE_INKOOP[velden.btwPercentage] : undefined;
  if (code === undefined) throw AppError.validation("Het btw-tarief van de bon wordt niet geboekt.");
  if (velden.grondslagCents + velden.btwCents !== velden.totaalCents) {
    throw AppError.validation("Grondslag plus btw is niet gelijk aan het totaal van de bon.");
  }
  const tegenrekening = opties.betaaldMet === "bank" ? REKENING_BANK : REKENING_CREDITEUREN;
  const regels: RegelInvoer[] = [];
  if (velden.grondslagCents > 0) {
    regels.push({
      rekeningId: ctx.rekeningId(velden.rekeningNummer),
      debetCents: velden.grondslagCents,
      btwCodeId: ctx.btwCodeId(code),
      btwBasisCents: velden.grondslagCents,
    });
  }
  if (velden.btwCents > 0) {
    regels.push({
      rekeningId: ctx.rekeningId(REKENING_VOORBELASTING),
      debetCents: velden.btwCents,
      btwCodeId: ctx.btwCodeId(code),
      isBtwRegel: true,
    });
  }
  regels.push({
    rekeningId: ctx.rekeningId(tegenrekening),
    creditCents: velden.totaalCents,
    ...(opties.betaaldMet === "bank" ? {} : { postSleutel: postSleutelVoorBon(opties.bonId) }),
  });
  return {
    administratieId: ctx.administratieId,
    dagboek: opties.betaaldMet === "bank" ? "BANK" : "INKOOP",
    datum: velden.bonDatum,
    bron: "BON",
    bronId: opties.bonId,
    omschrijving: omschrijvingVoor("BON", bonNummerVoor(velden.bonDatum, opties.sha256)),
    valuta: velden.valuta,
    regels,
    bronHash: opties.sha256,
    ...(opties.aangemaaktDoor !== undefined ? { aangemaaktDoor: opties.aangemaaktDoor } : {}),
  };
}
