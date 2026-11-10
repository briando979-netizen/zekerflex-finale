// Teksten van de pushbanner (components/app/PushToggle.tsx). Werker, werkgever
// en beheer delen de banner: de werker-app geeft eigen teksten mee uit
// lib/i18n/freelancer.ts (vijf talen), de rest krijgt deze Nederlandse standaard.
// Puur bestand: ook te gebruiken in tests.

export interface PushBannerTexts {
  /** waarom aanzetten (de werker hoort over klussen in de buurt, de werkgever over zijn diensten) */
  aanzetten: string;
  /** iPhone zonder beginscherm-app: daar kan Web Push nog niet */
  ios: string;
  knop: string;
  bezig: string;
  nietNu: string;
}

/** Teksten van de stap "Meldingen aanzetten" (variant "stap", /dashboard/eerste-indruk): vijf talen in lib/i18n/freelancer.ts. */
export interface PushStapTexts {
  knop: string;
  bezig: string;
  /** meldingen staan aan */
  ok: string;
  /** iPhone zonder beginscherm-app */
  ios: string;
  /** eerder geweigerd in de browser */
  geweigerd: string;
  /** eerder geweigerd in de geïnstalleerde app */
  geweigerdApp: string;
  /** de browser of de server kan geen meldingen */
  nietMogelijk: string;
  fout: string;
}

export const PUSH_BANNER_NL: PushBannerTexts = {
  aanzetten: "Zet meldingen aan, dan krijg je een seintje bij een dienst die begint, een oproep of een nieuw bericht — ook als ZekerFlex dicht is.",
  ios: "Op iPhone krijg je meldingen pas als ZekerFlex op je beginscherm staat: tik op Deel → Zet op beginscherm en open het daarvandaan.",
  knop: "Meldingen aanzetten",
  bezig: "Bezig…",
  nietNu: "Niet nu",
};

/** Weggeklikt? Dan komt de banner na 14 dagen terug (vroeger: nooit meer). */
export const BANNER_WEER_NA_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Mag de banner weer verschijnen? `opgeslagen` is wat er in localStorage staat:
 * niets, het oude "1" (voor altijd weggeklikt, van vóór deze regel) of een tijdstip.
 */
export function bannerWeerTonen(opgeslagen: string | null, nu: number): boolean {
  if (!opgeslagen || opgeslagen === "1") return true;
  const toen = Number(opgeslagen);
  if (!Number.isFinite(toen)) return true;
  return nu - toen >= BANNER_WEER_NA_MS;
}
