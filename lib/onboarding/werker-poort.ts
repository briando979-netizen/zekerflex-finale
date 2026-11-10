// ---------------------------------------------------------------------------
// De poort van de werker-app (10 nov 2026, op verzoek van de eigenaar): eerst de
// onboarding helemaal invullen, pas daarna de rest van de app. Puur bestand: de
// regels hier, de feiten in lib/onboarding/werker-poort-server.ts, het scherm in
// components/app/OnboardingPoort.tsx.
//
// "Ingevuld" is niet hetzelfde als "goedgekeurd": een ID-controle of een document
// voor het recht om te werken die bij een medewerker ligt, telt als ingevuld. Wie
// wacht, ziet de app al; aannemen kan pas na goedkeuring (lib/fiscal/eligibility.ts).
// ---------------------------------------------------------------------------

export interface WerkerPoortFeiten {
  /** richting gekozen: zzp'er, flexwerker of uitzendkracht */
  soortGekozen: boolean;
  /** branches gekozen (een of meer, of alle) */
  branchesGekozen: boolean;
  /** fiscale gegevens, KVK/btw/KOR (of uitzendkracht met getekende overeenkomst), IBAN en thuisbasis */
  gegevensIngevuld: boolean;
  /** de ID-controle is ingestuurd (in behandeling) of goedgekeurd */
  identiteitIngestuurd: boolean;
  /** verklaring aangevinkt en bewijs ingestuurd of goedgekeurd (lib/werkrecht: stand "ok" of "wacht") */
  werkrechtIngevuld: boolean;
  /** tweestapsverificatie aan (app met codes) of een passkey (10 nov, eigenaar) */
  tweestapAan: boolean;
}

export function werkerOnboardingKlaar(f: WerkerPoortFeiten): boolean {
  // het recht om te werken hoort sinds 10 nov niet meer bij de onboarding (eigenaar); het blijft verplicht
  // vóór de eerste betaalde klus (payoutEligibility, eisWerkrecht)
  return f.soortGekozen && f.branchesGekozen && f.gegevensIngevuld && f.identiteitIngestuurd && f.tweestapAan;
}

/**
 * Wat een werker al mag zien zolang de onboarding niet klaar is: de schermen waar je
 * de stappen invult (Verificatie, Fiscaal) en je account (uitloggen, taal, account
 * verwijderen). Al het andere toont de start.
 */
const TOEGESTAAN = ["/dashboard/verificatie", "/dashboard/fiscaal", "/dashboard/account"];

export function toegestaanTijdensOnboarding(pad: string | null | undefined): boolean {
  const p = (pad ?? "").replace(/\/+$/, "");
  return TOEGESTAAN.some((t) => p === t || p.startsWith(`${t}/`));
}
