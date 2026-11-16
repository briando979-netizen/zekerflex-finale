// ---------------------------------------------------------------------------
// Het beeld van een product uit het aanbod, voor zoekmachines en het delen (16 nov 2026, eigenaar: "boven in de zoekresultaten,
// met schermafbeeldingen en betere foto's die laten zien waar ZekerFlex voor staat"). Eerst een echt scherm van het product
// (inkijk of de schermen van de uitgebreide opmaak; geen telefoon: die is staand), anders de eigen foto. Puur: de pagina
// (og:image, JSON-LD) en de sitemap (beeld-sitemap voor Google Afbeeldingen) lezen het allebei.
// ---------------------------------------------------------------------------

import type { AanbodItem } from "@/lib/marketing/aanbod";
import { uitgebreidVan } from "@/lib/marketing/aanbod-uitgebreid";

export interface AanbodBeeld {
  /** pad vanaf de root (public/), bijvoorbeeld /aanbod/inkijk/horeca-kassa.webp */
  pad: string;
  alt: string;
  breedte: number;
  hoogte: number;
}

/** De foto's in public/aanbod zijn 1600 × 1200 (public/aanbod/CREDITS.md). */
const FOTO = { breedte: 1600, hoogte: 1200 };

/** Alle beelden van een product: eerst de echte schermen, dan de foto. */
export function aanbodBeelden(a: AanbodItem): AanbodBeeld[] {
  const schermen = (a.inkijk ?? [])
    .filter((s) => s.toestel !== "telefoon")
    .map((s) => ({ pad: `/aanbod/inkijk/${s.bestand}`, alt: s.alt, breedte: s.breedte, hoogte: s.hoogte }));
  // de uitgebreide opmaak (lib/marketing/aanbod-uitgebreid.ts) heeft zijn eigen schermen en foto
  const u = uitgebreidVan(a.slug);
  const uitgebreid = u ? [u.beelden.tablet, u.beelden.beheer].map((b) => ({ pad: `/aanbod/${b.bestand}`, alt: b.alt, breedte: b.breed, hoogte: b.hoog })) : [];
  const foto = a.foto ?? u?.foto;
  return [...schermen, ...uitgebreid, ...(foto ? [{ pad: `/aanbod/${foto.bestand}`, alt: foto.alt, ...FOTO }] : [])];
}

/**
 * Het ene beeld voor og:image en de deelkaart: het eerste beeld dat liggend genoeg is voor een kaart (verhouding 1,2 tot 2,1;
 * een heel brede strook of een staand scherm wordt in Google een smalle uitsnede), anders het eerste; null = het algemene beeld.
 */
export function aanbodBeeld(a: AanbodItem): AanbodBeeld | null {
  const alle = aanbodBeelden(a);
  return alle.find((b) => b.breedte / b.hoogte >= 1.2 && b.breedte / b.hoogte <= 2.1) ?? alle[0] ?? null;
}
