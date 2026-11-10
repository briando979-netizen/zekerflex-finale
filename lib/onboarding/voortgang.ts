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

export type WerkgeverStapSleutel = "email" | "bedrijf" | "verificatie" | "klus";

export interface WerkgeverFeiten {
  emailBevestigd: boolean;
  /** KVK gekoppeld én minstens één vestiging */
  bedrijfKlaar: boolean;
  verified: boolean;
  /** KVK klopt, ZekerFlex controleert met de hand */
  inControle: boolean;
  heeftKlus: boolean;
}

export function werkgeverStappen(f: WerkgeverFeiten): Stap<WerkgeverStapSleutel>[] {
  const email: Stap<WerkgeverStapSleutel> = { key: "email", done: f.emailBevestigd, href: "/verifieer-email", minuten: 1 };
  const bedrijf: Stap<WerkgeverStapSleutel> = { key: "bedrijf", done: f.bedrijfKlaar, href: "/werkgever", minuten: 3 };
  const verificatie: Stap<WerkgeverStapSleutel> = { key: "verificatie", done: f.verified, href: "/werkgever", minuten: f.inControle ? 0 : 2 };
  const klus: Stap<WerkgeverStapSleutel> = { key: "klus", done: f.heeftKlus, href: "/werkgever/diensten/nieuw", minuten: 5 };
  // wij controleren het bedrijf met de hand: voor de werkgever valt daar niets te doen, dus die stap
  // staat achteraan en de eerstvolgende stap is dan gewoon een (test)klus plaatsen
  return f.inControle && !f.verified ? [email, bedrijf, klus, verificatie] : [email, bedrijf, verificatie, klus];
}

// ---------------------------------------------------------------------------
// Herinneringen: welke vastgelopen toestand is dit?
// ---------------------------------------------------------------------------

export type HerinneringReden =
  | "email"
  | "werker-profiel"
  | "werker-verificatie"
  | "bedrijf-gegevens"
  | "bedrijf-verificatie"
  | "bedrijf-klus";

export interface HerinneringFeiten {
  rol: "werker" | "bedrijf";
  emailBevestigd: boolean;
  /** werker */
  kycVerified?: boolean;
  heeftProfiel?: boolean;
  /** bedrijf */
  bedrijfKlaar?: boolean;
  verified?: boolean;
  inControle?: boolean;
  heeftKlus?: boolean;
}

/** Waar blijft deze gebruiker steken? null = niets te herinneren (of niets wat hij zelf kan doen). */
export function herinneringReden(f: HerinneringFeiten): HerinneringReden | null {
  if (!f.emailBevestigd) return "email";
  if (f.rol === "werker") {
    if (f.kycVerified && f.heeftProfiel) return null;
    return f.heeftProfiel ? "werker-verificatie" : "werker-profiel";
  }
  if (!f.bedrijfKlaar) return "bedrijf-gegevens";
  // wij controleren het bedrijf: de werkgever hoeft niets te doen, een herinnering zou onwaar zijn
  if (!f.verified) return f.inControle ? null : "bedrijf-verificatie";
  if (!f.heeftKlus) return "bedrijf-klus";
  return null;
}

/** Inhoud van de herinnering: wat is er nog te doen en waarom (gewoon Nederlands). */
export function herinneringInhoud(reden: Exclude<HerinneringReden, "email">): { todo: string; why: string; href: string } {
  switch (reden) {
    case "werker-profiel":
      return {
        todo: "vul je thuisbasis en rekeningnummer in en bevestig je identiteit",
        why: "Je hebt je werkvorm al gekozen, dat scheelt. Hierna kun je direct op klussen reageren en word je uitbetaald via ZekerFlex.",
        href: "/dashboard/verificatie",
      };
    case "werker-verificatie":
      return {
        todo: "bevestig je identiteit",
        why: "Je profiel staat er al. Met een geverifieerde identiteit weten opdrachtgevers dat jij het echt bent, en kun je op klussen reageren.",
        href: "/dashboard/verificatie",
      };
    case "bedrijf-gegevens":
      return {
        todo: "vul je KVK-nummer en eerste vestiging in",
        why: "Zodra je bedrijf geverifieerd is, kun je klussen plaatsen en freelancers inplannen. Tot die tijd kun je één testklus uitzetten.",
        href: "/werkgever",
      };
    case "bedrijf-verificatie":
      return {
        todo: "rond de verificatie van je bedrijf af",
        why: "Je vestiging staat er al. Zodra je bedrijf is geverifieerd kun je mensen inplannen; tot die tijd kun je één testklus uitzetten.",
        href: "/werkgever",
      };
    case "bedrijf-klus":
      return {
        todo: "plaats je eerste klus",
        why: "Je bedrijf is geverifieerd. Een klus plaatsen kost een paar minuten; freelancers in jouw regio zien hem direct en kunnen reageren.",
        href: "/werkgever/diensten/nieuw",
      };
  }
}
