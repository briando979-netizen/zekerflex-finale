// ---------------------------------------------------------------------------
// Na de aanmelding (de 5 stappen van lib/onboarding/werker-poort.ts) is er nog een tweede rijtje vóór een werker op een
// klus kan reageren: het ID goedgekeurd, en per soort de gegevens voor betalen (lib/fiscal/eligibility.ts). Tot 15 nov
// stond dat rijtje nergens als geheel: de stappenteller zei "klaar", een tweede startkaart toonde verkeerde stappen en de
// echte reden werd op Klussen weggefilterd (eigenaar: "niet strak, loopt gelijk, onoverzichtelijk"). Dit is de ene lijst
// die Klussen toont; dezelfde regels als payoutEligibility, zodat "alles af" hier precies "reageren kan" is.
// Puur bestand: de feiten komen van lib/onboarding/klaar-voor-klus-server.ts.
// ---------------------------------------------------------------------------

import { ZEKERFLEX_UITZENDER } from "@/lib/uitzend/model";

export type KlusStuk ="bsn" | "contract" | "bedrijf" | "kvkWacht" | "iban" | "werkrecht" | "idWacht";

export interface KlusFeiten {
  soort: "zzp" | "flexwerker" | "uitzendkracht" | null;
  /** loonadministratie (uitzendkracht): verloning via ZekerFlex, dus BSN + overeenkomst; anders factureren (KVK/btw/KOR) */
  payroll: boolean;
  /** het ID is goedgekeurd (kycStatus VERIFIED) */
  idGoedgekeurd: boolean;
  /** het BSN staat (versleuteld) in de fiscale gegevens */
  bsn: boolean;
  /** een getekende, geldende uitzendovereenkomst */
  contract: boolean;
  /** een geldig KVK- of btw-nummer, of de KOR (zzp'er, flexwerker) */
  bedrijf: boolean;
  /** het KVK-nummer is ingevuld maar de controle bij de KVK wacht nog (kvkWachtVan in lib/kvk/tegoed-opslag.ts) */
  kvkWacht: boolean;
  /** een rekeningnummer (IBAN) om op uit te betalen */
  iban: boolean;
  /** de vlag werkrecht-eis staat aan en het recht om te werken is nog niet aangetoond */
  werkrechtOpen: boolean;
  /**
   * proefklussen (lib/fiscal/proefklussen-kern.ts): een zzp'er of flexwerker mag zijn eerste 2 klussen aannemen zonder
   * KVK/btw/KOR en rekeningnummer. true = hij heeft die ruimte nog; dan houden `bedrijf` en `iban` reageren niet tegen.
   * Ontbreekt het veld, dan geldt de gewone regel.
   */
  proefRuimte?: boolean;
}

/**
 * Wat er na de aanmelding nog nodig is om te reageren, in de volgorde waarin een werker het doet; leeg = niets meer.
 * Eerst wat hij zelf invult, als laatste het nagekeken worden van zijn ID (daar hoeft hij niets voor te doen, en de rest
 * kan intussen al).
 */
export function nogVoorEersteKlus(f: KlusFeiten): KlusStuk[] {
  const lijst: KlusStuk[] = [];
  // proefklussen: alleen op het factuurspoor; een uitzendkracht houdt BSN, overeenkomst en rekeningnummer
  const proef = !f.payroll && f.proefRuimte === true;
  // ZekerFlex is sinds 21 nov zelf geen uitzender (lib/uitzend/model.ts): het uitzendbureau vraagt een uitzendkracht zelf om
  // BSN, contract en rekeningnummer, dus ZekerFlex niet meer
  const zfVerloont = f.payroll && ZEKERFLEX_UITZENDER;
  if (f.payroll) {
    if (zfVerloont && !f.bsn) lijst.push("bsn");
    if (zfVerloont && !f.contract) lijst.push("contract");
  } else if (!f.bedrijf && !proef) {
    // wacht de KVK-controle, zeg dat dan eerlijk in plaats van "vul je KVK-nummer in" (da, 15 nov)
    lijst.push(f.kvkWacht ? "kvkWacht" : "bedrijf");
  }
  if (!f.iban && !proef && (!f.payroll || zfVerloont)) lijst.push("iban");
  if (f.werkrechtOpen) lijst.push("werkrecht");
  if (!f.idGoedgekeurd) lijst.push("idWacht");
  return lijst;
}

/**
 * Waar een werker een stuk invult: op /dashboard/verificatie, bij het blok met de kop "Nog nodig vóór je eerste klus"
 * (BSN, btw/KOR: GegevensMist met kopId gegevens-later-kop), de bankrekening en de overeenkomst. null: niets te doen.
 */
export const KLUS_STUK_HREF: Record<KlusStuk, string | null> = {
  bsn: "/dashboard/verificatie#gegevens-later-kop",
  bedrijf: "/dashboard/verificatie#gegevens-later-kop",
  kvkWacht: null,
  contract: "/dashboard/verificatie#uitzendovereenkomst",
  iban: "/dashboard/verificatie#bankrekening",
  werkrecht: "/dashboard/verificatie#werkrecht",
  idWacht: null,
};
