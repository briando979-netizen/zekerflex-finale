// ---------------------------------------------------------------------------
// De regels van het fiscale formulier van de werker (components/app/FiscalForm.tsx), puur en los te testen. Geen prisma, geen
// kv, geen fs: ook de browser mag dit inlezen. Alleen types komen uit lib/fiscal/store.ts (die server-only is).
//
// 14 nov 2026 (kaart van de onboarding, punten 12, 5 en 7): het formulier vraagt niets dubbel meer.
//  - het IBAN telt niet meer als "mist" en is optioneel: het rekeningnummer bevestig je bij Verificatie, vóór je eerste betaalde
//    klus (lib/fiscal/eligibility.ts blijft dat eisen; isComplete in store.ts ook voor de loonstrook);
//  - de werkvorm is geen keuze meer als hij al gekozen is ("je koos X", met wijzigen);
//  - KVK, btw en KOR die al zijn ingevuld (bij de aanmelding) staan als samenvatting met wijzigen, niet als tweede invoer.
// ---------------------------------------------------------------------------

import type { WorkerKind } from "@/lib/fiscal/store";

export type FormulierMist = "btwZzp" | "btwFlex" | "bsn";

export interface FormulierFeiten {
  kind: WorkerKind;
  vatNumber: string;
  vatRequested: boolean;
  kvkNumber: string;
  /** de KOR is bevestigd */
  kor: boolean;
  /** een KOR-aanvraag is ingediend (telt als ingevuld, zoals "btw aangevraagd") */
  korIngediend: boolean;
  hasBsn: boolean;
  /** het BSN dat nu in het veld staat */
  bsn: string;
}

/**
 * Wat het formulier nog mist voor de gekozen werkvorm. Het IBAN hoort hier bewust NIET bij: het is niet nodig om je gegevens in
 * te vullen en komt vóór de eerste betaalde klus (lib/fiscal/eligibility.ts houdt dat tegen).
 */
export function formulierMist(f: FormulierFeiten): FormulierMist[] {
  const mist: FormulierMist[] = [];
  if (f.kind === "zzp" && !(f.vatNumber.trim() || (f.vatRequested && f.kvkNumber.trim()))) mist.push("btwZzp");
  if (f.kind === "flexwerker" && !(f.vatNumber.trim() || f.kor || f.vatRequested || f.korIngediend)) mist.push("btwFlex");
  if (f.kind === "uitzendkracht" && !(f.hasBsn || f.bsn.trim())) mist.push("bsn");
  return mist;
}

/** Het IBAN voor de opslag: alleen meesturen als er iets staat (de route eist 15 tekens of meer als het er is). */
export function ibanVoorOpslag(iban: string): { iban?: string } {
  const schoon = iban.trim();
  return schoon ? { iban: schoon } : {};
}

/** Staat de werkvorm al vast? Dan geen keuze meer tonen, tenzij de werker op "wijzigen" drukte. */
export function toonWerkvormKeuze(opgeslagen: WorkerKind | null | undefined, wijzigen: boolean): boolean {
  return !opgeslagen || wijzigen;
}

/** Een KVK-nummer uit het profiel zonder de plaatshouders van de aanmelding ("pending-…", "vat-…"): alleen 8 cijfers. */
export function schoonKvk(ruw: string | null | undefined): string {
  const s = (ruw ?? "").replace(/[\s.]/g, "");
  return /^\d{8}$/.test(s) ? s : "";
}

export interface BedrijfFeiten {
  kvk: string;
  btw: string;
  /** de KOR is bevestigd */
  kor: boolean;
  btwAangevraagd: boolean;
  korIngediend: boolean;
}

/**
 * Is het bedrijfsdeel voor deze werkvorm al ingevuld (bij de aanmelding)? Dan toont Fiscaal een samenvatting met wijzigen in
 * plaats van een tweede invoer. Een uitzendkracht heeft geen KVK of btw: daar is niets samen te vatten.
 */
export function bedrijfAlIngevuld(kind: WorkerKind, b: BedrijfFeiten): boolean {
  if (kind === "zzp") return Boolean(b.kvk.trim() || b.btw.trim());
  if (kind === "flexwerker") return Boolean(b.kvk.trim() || b.btw.trim() || b.kor || b.btwAangevraagd || b.korIngediend);
  return false;
}
