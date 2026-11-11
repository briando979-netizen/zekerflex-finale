// ---------------------------------------------------------------------------
// Bewegingscontrole bij de selfie: een tweede selfie waarop het hoofd een stuk gedraaid is. Puur bestand.
//
// Waarom dit werkt: de verhouding "neus ten opzichte van het midden van de ogen, gedeeld door de afstand
// tussen de ogen" (draaiing in vergelijk.ts) verandert bij een echt hoofd dat draait, omdat de neus voor het
// gezicht uitsteekt. Een plat beeld (een foto, een scherm, een geprint portret) dat je kantelt wordt aan één
// kant korter, maar neus en ogen worden dan allemaal in dezelfde verhouding korter: de verhouding blijft gelijk.
// Zo vangen we een selfie van een foto of scherm, zonder dat de gebruiker een kant hoeft te kiezen (en dus
// zonder verwarring over spiegelbeelden bij de voorste camera).
//
// Wat het niet vangt: iemand die twee echte foto's van het slachtoffer heeft, recht en gedraaid, of een video
// van die persoon die zijn hoofd draait. Dat is een hogere drempel dan één foto, geen certificaat van echtheid.
// De drempels zijn gemeten op een enkel voorbeeld (een portret met draaiing −0,25 tegenover ~0 bij de rest) en
// nog niet op echte aanmeldingen; de uitslag staat bij elke verificatie, dus ze zijn later bij te stellen.
// ---------------------------------------------------------------------------

import { draaiing, meerdereGezichten, type GemetenGezicht } from "@/lib/kyc/gezicht/vergelijk";

export const BEWEGING = {
  /** de eerste selfie moet bijna recht in de camera zijn (draaiing, zie vergelijk.ts) */
  rechtMax: 0.12,
  /** minimaal verschil in draaiing tussen de twee selfies: ongeveer een kwartslag van het hoofd */
  minVerschil: 0.18,
  /** de twee selfies moeten dezelfde persoon zijn; lager dan de pasfoto-drempel omdat een gedraaid gezicht minder scoort */
  zelfdePersoon: 0.4,
  /** kwaliteit van het gedraaide gezicht */
  minScore: 0.7,
  minBreedte: 100,
  /**
   * Hoeveel de oogafstand (gedeeld door de gezichtshoogte) hooguit mag krimpen van de eerste naar de tweede selfie.
   * Gemeten op de server (11 nov): een echt gedraaid hoofd gaf 0,88; een steil gekanteld plat beeld (horizontaal
   * samengeknepen tot 45–60%) geeft 0,43–0,82, en daar verschuift de detector de punten zo dat de draaiing tot
   * ±0,4 kan springen. Onder deze grens telt een "draai" dus niet.
   */
  minOogverhouding: 0.75,
} as const;

export type BewegingOordeel = "ok" | "niet-beoordeeld" | "niet-aangeleverd" | "geen-gezicht" | "te-onzeker" | "niet-recht" | "niet-gedraaid" | "onnatuurlijk" | "andere-persoon";

/** Oogafstand gedeeld door de hoogte van het gezichtskader: schaalvrij (afstand tot de camera maakt niet uit). */
export function oogVerhouding(g: GemetenGezicht["gezicht"]): number {
  const afstand = Math.hypot(g.punten[1].x - g.punten[0].x, g.punten[1].y - g.punten[0].y);
  return g.hoogte > 0 ? afstand / g.hoogte : 0;
}

export interface BewegingUitslag {
  oordeel: BewegingOordeel;
  /** hoeveel de draaiing veranderde tussen de twee selfies; null als dat niet te meten viel */
  verschil: number | null;
  /** gewoon Nederlands, voor de gebruiker en de medewerker */
  reden: string;
}

const uit = (oordeel: BewegingOordeel, reden: string, verschil: number | null = null): BewegingUitslag => ({ oordeel, verschil, reden });

export const BEWEGING_NIET_BEOORDEELD = uit("niet-beoordeeld", "De bewegingscontrole is niet uitgevoerd. Een medewerker kijkt mee.");
export const BEWEGING_NIET_AANGELEVERD = uit("niet-aangeleverd", "Er is geen tweede selfie met een gedraaid hoofd. Een medewerker kijkt mee.");

/**
 * `recht`: de eerste selfie (die ook met de pasfoto vergeleken is). `gedraaid`: de tweede selfie.
 * `gelijkenis`: de cosinus van de twee gezichten, of null als die niet te meten viel.
 */
export function beoordeelBeweging(recht: GemetenGezicht, gedraaid: GemetenGezicht | null, gelijkenis: number | null): BewegingUitslag {
  if (!gedraaid) return uit("geen-gezicht", "Op de tweede selfie is geen gezicht gevonden. Houd je gezicht in het ovaal en zorg voor goed licht.");
  if (gedraaid.gezicht.score < BEWEGING.minScore || gedraaid.gezicht.breedte < BEWEGING.minBreedte || meerdereGezichten(gedraaid)) {
    return uit("te-onzeker", "Het gezicht op de tweede selfie is te klein, te onscherp of er staat meer dan één gezicht op. Maak hem opnieuw, alleen jezelf, met goed licht.");
  }
  const a = draaiing(recht.gezicht);
  const b = draaiing(gedraaid.gezicht);
  if (Math.abs(a) > BEWEGING.rechtMax) {
    return uit("niet-recht", "Bij de eerste selfie keek je niet recht in de camera. Maak hem opnieuw en kijk recht vooruit.", Math.abs(b - a));
  }
  const verschil = Math.abs(b - a);
  if (verschil < BEWEGING.minVerschil) {
    return uit("niet-gedraaid", "Je hoofd was op de tweede selfie niet duidelijk gedraaid. Draai het een kwartslag naar links of rechts en maak de foto opnieuw.", verschil);
  }
  // een echt hoofd wordt bij een kwartslag maar beperkt smaller; een platgedrukt beeld veel meer
  const krimp = oogVerhouding(recht.gezicht) > 0 ? oogVerhouding(gedraaid.gezicht) / oogVerhouding(recht.gezicht) : 0;
  if (krimp < BEWEGING.minOogverhouding) {
    return uit("onnatuurlijk", "Het gezicht op de tweede selfie ziet er platgedrukt uit. Maak de foto opnieuw, draai alleen je hoofd en houd de camera recht voor je.", verschil);
  }
  if (gelijkenis === null || gelijkenis < BEWEGING.zelfdePersoon) {
    return uit("andere-persoon", "De twee selfies lijken niet op dezelfde persoon. Een medewerker kijkt mee.", verschil);
  }
  return uit("ok", "Het hoofd draaide echt tussen de twee selfies.", verschil);
}
