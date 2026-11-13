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

/**
 * De verplichte stappen, in de volgorde waarin een werker ze doet. Dit is de enige lijst: de poort (werkerOnboardingKlaar,
 * openVerplicht) en de tijdlijn "Laat weten wie je bent" (lib/onboarding/laat-weten.ts) lezen haar allebei, zodat de teller
 * "stap n van 5" overal hetzelfde telt (13 nov: er waren vier tellers). "sleutel" is de naam in de tijdlijn en de teksten.
 * Het recht om te werken hoort sinds 10 nov niet meer bij de onboarding (eigenaar); het blijft verplicht vóór de eerste
 * betaalde klus (payoutEligibility, eisWerkrecht). Tweestapsverificatie is sinds 12 nov optioneel (eigenaar), en een
 * bevestigd e-mailadres telt hier niet mee: dat is een melding, geen stap.
 */
export const POORT_STAPPEN = [
  { sleutel: "kind", feit: "soortGekozen" },
  { sleutel: "branches", feit: "branchesGekozen" },
  { sleutel: "gegevens", feit: "gegevensIngevuld" },
  { sleutel: "identiteit", feit: "identiteitIngestuurd" },
  { sleutel: "foto", feit: "fotoGezet" },
] as const satisfies readonly { sleutel: string; feit: keyof WerkerPoortFeiten }[];

export function werkerOnboardingKlaar(f: WerkerPoortFeiten): boolean {
  return POORT_STAPPEN.every((s) => f[s.feit]);
}

/**
 * "Stap 3 van 5": de eerste open stap van de poort, met zijn nummer, het aantal stappen en de sleutel (kind, branches,
 * gegevens, identiteit, foto); null als alles klaar is. Dezelfde teller als de tijdlijn (stapVanTotaal in laat-weten.ts).
 */
export function poortStapVan(f: WerkerPoortFeiten): { n: number; totaal: number; sleutel: (typeof POORT_STAPPEN)[number]["sleutel"] } | null {
  const i = POORT_STAPPEN.findIndex((s) => !f[s.feit]);
  const stap = POORT_STAPPEN[i];
  return i < 0 || !stap ? null : { n: i + 1, totaal: POORT_STAPPEN.length, sleutel: stap.sleutel };
}

/** De verplichte stappen (zoals werkerOnboardingKlaar) die nog open staan. */
export function openVerplicht(f: WerkerPoortFeiten): number {
  return POORT_STAPPEN.filter((s) => !f[s.feit]).length;
}

/**
 * Wat het klaar-scherm van Verificatie (gegevens en ID af) als volgende stap toont. "foto": alleen de profielfoto mist
 * nog, dus rechtstreeks naar /dashboard/eerste-indruk?stap=foto. "stappen": er mist nog iets anders (bijv. branches bij
 * een account van vóór 10 nov); de fotopagina stuurt dan terug naar Verificatie, dus naar de stappen bovenaan Klussen.
 * Gemeten 12 nov: 6 van de 7 geverifieerde nieuwe werkers zonder foto hadden verder alles ingevuld, kwamen nooit op de
 * fotopagina en lazen hier "je kunt diensten aannemen".
 */
export function volgendeNaVerificatie(f: WerkerPoortFeiten | null): "klaar" | "foto" | "stappen" {
  if (!f || werkerOnboardingKlaar(f)) return "klaar";
  return werkerOnboardingKlaar({ ...f, fotoGezet: true }) ? "foto" : "stappen";
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
