// ---------------------------------------------------------------------------
// De keuzeschakelaar bovenaan de homepage-hero ("Ik zoek werk" / "Ik zoek personeel", 11 nov, eigenaar).
// Zonder keuze toont de hero precies de tekst die er nu staat (die de Site-ontwerper kan aanpassen);
// pas na een tik wisselt hij naar de tekst voor die bezoeker. Puur (geen React, geen kv), zodat
// tests/hero-keuze.test.ts de teksten en de links kan controleren. Alleen vaste feiten (zie
// lib/ads/generate.ts): gratis meedoen, € 3,50 per gewerkt uur, zelf kiezen wanneer je betaald wordt.
// ---------------------------------------------------------------------------

export type HeroKeuze = "werker" | "werkgever";

export interface HeroVariant {
  /** tekst op de knop van de schakelaar */
  knop: string;
  eyebrow: string;
  titleLine1: string;
  titleLine2: string;
  lead: string;
  ctaPrimary: { label: string; href: string };
  ctaSecondary: { label: string; href: string };
  /** drie korte voordelen onder de knoppen */
  punten: [string, string, string];
}

export const HERO_KEUZES: Record<HeroKeuze, HeroVariant> = {
  werker: {
    knop: "Ik zoek werk",
    eyebrow: "Voor werkers · flexwerk en zzp",
    titleLine1: "Werk dat past",
    titleLine2: "bij jouw leven.",
    lead: "Kies zelf je klussen, dichtbij huis en op jouw tijden. Meedoen is gratis en jij bepaalt hoe snel je betaald wordt.",
    ctaPrimary: { label: "Meld je gratis aan", href: "/register" },
    ctaSecondary: { label: "Bekijk open klussen", href: "/klussen" },
    punten: ["Werk bij jou in de buurt", "Gratis meedoen", "Zelf kiezen wanneer je betaald wordt"],
  },
  werkgever: {
    knop: "Ik zoek personeel",
    eyebrow: "Voor werkgevers · personeel en meer",
    titleLine1: "Personeel nodig?",
    titleLine2: "Zeker van je mensen.",
    lead: "Plaats een dienst en betrouwbare krachten reageren direct. Je betaalt € 3,50 per gewerkt uur, alleen als er echt iemand werkt. Geen abonnement, geen opstartkosten.",
    ctaPrimary: { label: "Plaats je eerste klus", href: "/klus-plaatsen" },
    ctaSecondary: { label: "Bekijk de prijzen", href: "/prijzen" },
    punten: ["Personeel als het druk is", "Betaal alleen per gewerkt uur", "Software voor jouw zaak"],
  },
};

export const HERO_KEUZE_VOLGORDE: readonly HeroKeuze[] = ["werker", "werkgever"];
