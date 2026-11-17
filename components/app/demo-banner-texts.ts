// Teksten voor de demo-balk (components/app/DemoBanner.tsx). Los, puur .ts-bestand,
// zodat er geen vaste Nederlandse zinnen in een .tsx staan dat zowel de werker- als de
// werkgever-app bereikt (taal-bewaker). De balk is bewust alleen Nederlands: het is een
// marketing-voorbeeld dat de bezoeker uitnodigt een echt account te maken.

export const DEMO_BANNER_TEKST =
  "Dit is een voorbeeld van ZekerFlex. Kijk gerust rond, er wordt niets opgeslagen.";

export const DEMO_BANNER_WERKER = { href: "/register?type=freelancer", knop: "Maak gratis je profiel" } as const;
export const DEMO_BANNER_WERKGEVER = { href: "/register?type=bedrijf", knop: "Maak een bedrijfsaccount" } as const;
