// ---------------------------------------------------------------------------
// De onboarding van de werker (10 nov 2026, op verzoek van de eigenaar). Sinds 12 nov (eigenaar: "zorg dat de
// werknemer alles ziet bij dashboard, alleen voor reageren eerst de onboarding") is de app open: wie de onboarding
// nog niet af heeft, ziet alles en de stappen bovenaan Klussen, maar reageert pas als hij klaar is
// (eisOnboardingVoorReageren in werker-poort-server.ts). Tweestapsverificatie is sinds 12 nov optioneel (eigenaar).
// Puur bestand: de regels hier, de feiten in lib/onboarding/werker-poort-server.ts.
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
  /** tweestapsverificatie aan (app met codes) of een passkey; sinds 12 nov optioneel (eigenaar), telt niet voor klaar */
  tweestapAan: boolean;
  /** een profielfoto geüpload (10 nov, eigenaar: een echte stap van de onboarding) */
  fotoGezet: boolean;
}

export function werkerOnboardingKlaar(f: WerkerPoortFeiten): boolean {
  // het recht om te werken hoort sinds 10 nov niet meer bij de onboarding (eigenaar); het blijft verplicht
  // vóór de eerste betaalde klus (payoutEligibility, eisWerkrecht)
  // tweestapsverificatie is sinds 12 nov optioneel (eigenaar): aanbevolen in de stappen, maar geen voorwaarde
  return f.soortGekozen && f.branchesGekozen && f.gegevensIngevuld && f.identiteitIngestuurd && f.fotoGezet;
}

/**
 * Wat een werker al mag zien zolang de onboarding niet klaar is: de schermen waar je
 * de stappen invult (Verificatie, Fiscaal) en je account (uitloggen, taal, account
 * verwijderen). Al het andere toont de start.
 */
const TOEGESTAAN = ["/dashboard/verificatie", "/dashboard/fiscaal", "/dashboard/account", "/dashboard/eerste-indruk"];

export function toegestaanTijdensOnboarding(pad: string | null | undefined): boolean {
  const p = (pad ?? "").replace(/\/+$/, "");
  return TOEGESTAAN.some((t) => p === t || p.startsWith(`${t}/`));
}
