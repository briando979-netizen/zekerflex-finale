// ---------------------------------------------------------------------------
// Onboarding-voortgang: één pure bron voor "wat moet nog" bij werkers en
// werkgevers. Geen prisma/kv: de aanroeper levert echte feiten, dit bestand
// rekent alleen. De serverregels voor wat verplicht is (lib/fiscal/eligibility.ts,
// lib/company/verified.ts) blijven leidend; hier wordt niets versoepeld.
// ---------------------------------------------------------------------------

export interface Stap<S extends string = string> {
  key: S;
  done: boolean;
  /** waar de stap wordt afgerond */
  href: string;
  /** ongeveer hoeveel minuten de stap kost */
  minuten: number;
  /** een tip: telt niet mee voor "klaar om te reageren", hoeft dus niet */
  optioneel?: boolean;
}

export interface Voortgang<S extends string = string> {
  /** alleen de verplichte stappen */
  done: number;
  total: number;
  pct: number;
  open: Stap<S>[];
  volgende: Stap<S> | null;
  /** som van de minuten van wat nog open staat (verplicht) */
  minutenOpen: number;
  /** alle verplichte stappen klaar */
  klaar: boolean;
}

export function berekenVoortgang<S extends string>(stappen: Stap<S>[]): Voortgang<S> {
  const verplicht = stappen.filter((s) => !s.optioneel);
  const done = verplicht.filter((s) => s.done).length;
  const total = verplicht.length;
  const open = stappen.filter((s) => !s.done);
  const openVerplicht = open.filter((s) => !s.optioneel);
  return {
    done,
    total,
    pct: total === 0 ? 100 : Math.round((done / total) * 100),
    open,
    volgende: openVerplicht[0] ?? open[0] ?? null,
    minutenOpen: openVerplicht.reduce((n, s) => n + s.minuten, 0),
    klaar: openVerplicht.length === 0,
  };
}

// ---------------------------------------------------------------------------
// Werker
// ---------------------------------------------------------------------------

export type WerkerStapSleutel = "email" | "soort" | "kvk" | "contract" | "identiteit" | "bank" | "push";

export interface WerkerFeiten {
  emailBevestigd: boolean;
  /** fiscaal profiel compleet (soort gekozen + gegevens) */
  fiscaalKlaar: boolean;
  uitzend: boolean;
  /** KVK/btw/KOR in orde (alleen zzp/flexwerker) */
  kvkOfBtw: boolean;
  /** uitzendovereenkomst ondertekend (alleen uitzend) */
  contractGetekend: boolean;
  identiteitGeverifieerd: boolean;
  /** thuisbasis én rekeningnummer */
  bankEnThuis: boolean;
  heeftPush: boolean;
}

export function werkerStappen(f: WerkerFeiten): Stap<WerkerStapSleutel>[] {
  const stappen: Stap<WerkerStapSleutel>[] = [
    { key: "email", done: f.emailBevestigd, href: "/verifieer-email", minuten: 1 },
    { key: "soort", done: f.fiscaalKlaar, href: "/dashboard/fiscaal", minuten: 3 },
  ];
  stappen.push(
    f.uitzend
      ? { key: "contract", done: f.contractGetekend, href: "/dashboard/verificatie", minuten: 3 }
      : { key: "kvk", done: f.kvkOfBtw, href: "/dashboard/verificatie", minuten: 3 },
  );
  stappen.push(
    { key: "identiteit", done: f.identiteitGeverifieerd, href: "/dashboard/verificatie", minuten: 4 },
    // 10 nov (eigenaar): geen "Meldingen aanzetten"-tip meer in de profiel-af-kaart (sleutel "push" blijft in het type voor de teksten)
    { key: "bank", done: f.bankEnThuis, href: "/dashboard/verificatie", minuten: 2 },
  );
  return stappen;
}

// ---------------------------------------------------------------------------
// Werkgever
// ---------------------------------------------------------------------------

// "Jouw start" (23 nov 2026, eigenaar: zoals YoungOnes): een checklist in twee blokken. Blok 1, "Jij en je bedrijf": de
// organisatie, het adres, het profiel en het e-mailadres. Blok 2, "Jouw eerste klus": klus plaatsen, reacties bekijken, een
// freelancer kiezen en afronden. Er is geen stap voor het KVK-nummer: de controle van het bedrijf komt pas als het iemand
// wil inplannen (lib/company/gecontroleerd.ts), dus zijn de reacties en het kiezen hier gewoon de laatste stappen.
export type WerkgeverStapSleutel = "org" | "adres" | "profiel" | "email" | "klus" | "reacties" | "kiezen" | "afronden";

export interface WerkgeverFeiten {
  /** de vragen over de organisatie (branche) zijn beantwoord */
  orgBeantwoord: boolean;
  /** minstens één vaste werklocatie: het adres is bevestigd */
  adresKlaar: boolean;
  /** het bedrijfsprofiel is bekeken */
  profielKlaar: boolean;
  emailBevestigd: boolean;
  heeftKlus: boolean;
  /** minstens één werker reageerde op een klus */
  heeftReactie: boolean;
  /** er is minstens één freelancer ingepland */
  heeftIngepland: boolean;
}

export interface WerkgeverStap extends Stap<WerkgeverStapSleutel> {
  /** 1 = Jij en je bedrijf, 2 = Jouw eerste klus */
  blok: 1 | 2;
}

export function werkgeverStappen(f: WerkgeverFeiten): WerkgeverStap[] {
  const blok1Klaar = f.orgBeantwoord && f.adresKlaar && f.profielKlaar && f.emailBevestigd;
  return [
    { key: "org", done: f.orgBeantwoord, href: "/werkgever", minuten: 1, blok: 1 },
    { key: "adres", done: f.adresKlaar, href: "/werkgever", minuten: 2, blok: 1 },
    { key: "profiel", done: f.profielKlaar, href: "/werkgever/bedrijf", minuten: 2, blok: 1 },
    { key: "email", done: f.emailBevestigd, href: "/verifieer-email", minuten: 1, blok: 1 },
    { key: "klus", done: f.heeftKlus, href: "/werkgever/diensten/nieuw", minuten: 5, blok: 2 },
    // wachten op werkers: er valt voor de werkgever niets te doen, dus geen minuten
    { key: "reacties", done: f.heeftReactie, href: "/werkgever/diensten", minuten: 0, blok: 2 },
    { key: "kiezen", done: f.heeftIngepland, href: "/werkgever/diensten", minuten: 1, blok: 2 },
    { key: "afronden", done: blok1Klaar && f.heeftIngepland, href: "/werkgever", minuten: 0, blok: 2 },
  ];
}

/** Blok 1 klaar én de eerste klus staat live: dan sluit de grote checklist en blijft alleen de kaart met wat er nog open staat. */
export function startKlaar(f: WerkgeverFeiten): boolean {
  return f.orgBeantwoord && f.adresKlaar && f.profielKlaar && f.emailBevestigd && f.heeftKlus;
}

// ---------------------------------------------------------------------------
// Herinneringen: welke vastgelopen toestand is dit?
// ---------------------------------------------------------------------------

export type HerinneringReden =
  | "email"
  | "werker-profiel"
  | "werker-verificatie"
  | "bedrijf-adres"
  | "bedrijf-klus";

export interface HerinneringFeiten {
  rol: "werker" | "bedrijf";
  emailBevestigd: boolean;
  /** werker */
  kycVerified?: boolean;
  heeftProfiel?: boolean;
  /** bedrijf: minstens één vaste werklocatie */
  adresKlaar?: boolean;
  heeftKlus?: boolean;
}

/**
 * Waar blijft deze gebruiker steken? null = niets te herinneren (of niets wat hij zelf kan doen). Een bedrijf hoort nooit een
 * herinnering om een KVK-nummer in te vullen: die controle komt pas bij het inplannen.
 */
export function herinneringReden(f: HerinneringFeiten): HerinneringReden | null {
  if (!f.emailBevestigd) return "email";
  if (f.rol === "werker") {
    if (f.kycVerified && f.heeftProfiel) return null;
    return f.heeftProfiel ? "werker-verificatie" : "werker-profiel";
  }
  if (!f.adresKlaar) return "bedrijf-adres";
  if (!f.heeftKlus) return "bedrijf-klus";
  return null;
}

/** Inhoud van de herinnering: wat is er nog te doen en waarom (gewoon Nederlands). */
export function herinneringInhoud(reden: Exclude<HerinneringReden, "email">): { todo: string; why: string; href: string } {
  switch (reden) {
    case "werker-profiel":
      return {
        todo: "vul je gegevens in en laat je ID controleren",
        why: "Je hebt je werkvorm al gekozen, dat scheelt. Daarna zie je bovenaan Ontdekken precies wat er nog nodig is voor je eerste klus.",
        href: "/dashboard/verificatie",
      };
    case "werker-verificatie":
      return {
        todo: "bevestig je identiteit",
        why: "Je profiel staat er al. Met een geverifieerde identiteit weten opdrachtgevers dat jij het echt bent, en kun je op klussen reageren.",
        href: "/dashboard/verificatie",
      };
    case "bedrijf-adres":
      return {
        todo: "bevestig het adres van je werklocatie",
        why: "Freelancers zien waar ze komen werken. Daarna zet je je eerste klus uit: hij staat meteen live en freelancers kunnen erop reageren.",
        href: "/werkgever",
      };
    case "bedrijf-klus":
      return {
        todo: "plaats je eerste klus",
        why: "Een klus plaatsen kost een paar minuten. Hij staat meteen live: freelancers in jouw regio zien hem en kunnen reageren.",
        href: "/werkgever/diensten/nieuw",
      };
  }
}
