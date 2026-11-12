// Teksten van de level- en uitnodigingskaart in het werker-Account (components/rewards/RewardsCards.tsx), 12 nov 2026. Puur bestand: de
// Nederlandse standaard staat hier (werkgever en beheer houden die), de vijf talen in lib/i18n/freelancer.ts (rewards). Level- en
// badgenamen, voordelen en omschrijvingen komen uit de server (lib/rewards) en blijven daarom Nederlands; hier alleen het kader.

export const LEVEL_KAART_NL = {
  /** BCP 47-tag voor getallen en bedragen */
  locale: "nl-NL",
  jouwLevel: "Jouw level",
  nogTot: "Nog {n} XP tot {volgende}",
  jouwVoordelen: "Jouw voordelen",
  badges: "Badges",
  verberg: "Verberg alle levels",
  bekijk: "Bekijk alle levels",
  vanaf: "vanaf {n} XP",
  xpUitleg: "XP: 100 per afgeronde klus, 25 per review, 500 extra bij 4,8+ gemiddeld",
  xpBank: ", plus bonussen voor ZekerFlex Bank, potjes en een pas.",
  xpEinde: ".",
};
export type LevelKaartTeksten = typeof LEVEL_KAART_NL;

export const UITNODIGING_NL = {
  locale: "nl-NL",
  titel: "Nodig iemand uit, krijg {bedrag}",
  uitleg: "Zij krijgen {bedrag} welkomstbonus. Uitbetaald op je ZekerFlex Bank zodra hun eerste klus is afgerond.",
  uitgenodigd: " Al {n} uitgenodigd · {bedrag} verdiend.",
  knop: "Deel je link",
  gekopieerd: "Link gekopieerd ✓",
  deelTekst: "Werk en verdien via ZekerFlex — met je eigen gratis bankrekening. Meld je aan met mijn link en krijg {bedrag} welkomstbonus: {link}",
};
export type UitnodigingTeksten = typeof UITNODIGING_NL;
