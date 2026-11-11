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
//
// Gemeten op de echte aanmeldingen van 11 nov 2026 (op de server, alleen getallen): 0 van de 4 tweede selfies
// kwam door. Eén hoofd draaide te ver (verschil 0,69, oogafstand 0,65: de tekst vroeg om "een kwartslag"),
// één bijna in profiel (gezicht te onzeker), één nauwelijks (0,04: wie op de knop drukt, kijkt weer naar het
// scherm) en één was dezelfde foto als de eerste. Daarom: de drempels hieronder blijven, maar de camera meet nu
// live mee (LIVE, POST /api/onboarding/gezicht-live) en maakt de foto vanzelf zodra het hoofd goed staat.
// ---------------------------------------------------------------------------

import { draaiing, meerdereGezichten, type GemetenGezicht } from "@/lib/kyc/gezicht/vergelijk";

export const BEWEGING = {
  /** de eerste selfie moet bijna recht in de camera zijn (draaiing, zie vergelijk.ts) */
  rechtMax: 0.12,
  /** minimaal verschil in draaiing tussen de twee selfies: het hoofd een klein stukje opzij (geen kwartslag: dan krimpt de oogafstand te veel) */
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
/** de tweede selfie is precies hetzelfde bestand als de eerste (gemeten 11 nov: een keer uit de galerij gekozen) */
export const BEWEGING_ZELFDE_FOTO = uit("niet-gedraaid", "De tweede selfie is dezelfde foto als de eerste. Maak een nieuwe foto en draai je hoofd een klein stukje opzij.", 0);

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
    return uit("niet-gedraaid", "Je hoofd was op de tweede selfie niet duidelijk gedraaid. Draai het een klein stukje opzij, naar links of rechts, en maak de foto opnieuw.", verschil);
  }
  // een echt hoofd wordt bij een kleine draai maar beperkt smaller; een platgedrukt beeld veel meer
  const krimp = oogVerhouding(recht.gezicht) > 0 ? oogVerhouding(gedraaid.gezicht) / oogVerhouding(recht.gezicht) : 0;
  if (krimp < BEWEGING.minOogverhouding) {
    return uit("onnatuurlijk", "Het gezicht op de tweede selfie ziet er platgedrukt uit. Maak de foto opnieuw, draai alleen je hoofd en houd de camera recht voor je.", verschil);
  }
  if (gelijkenis === null || gelijkenis < BEWEGING.zelfdePersoon) {
    return uit("andere-persoon", "De twee selfies lijken niet op dezelfde persoon. Een medewerker kijkt mee.", verschil);
  }
  return uit("ok", "Het hoofd draaide echt tussen de twee selfies.", verschil);
}

// ---------------------------------------------------------------------------
// Live meten terwijl de camera aan staat (IdScan): de server meet een klein beeld (alleen de detector, geen
// gezichtskenmerken, niets bewaard) en het scherm zegt wat de werker moet doen. Bij de tweede selfie maakt het
// scherm de foto vanzelf zodra het hoofd goed staat, en controleert die foto met dezelfde regels als de server
// (bewegingVoldoet). Dit bestand is puur, dus het scherm en de server delen precies dezelfde regels.
// ---------------------------------------------------------------------------

/** Wat de server live meet aan het grootste gezicht in een beeld. */
export interface LiveMeting {
  /** zie draaiing in vergelijk.ts */
  draaiing: number;
  /** zie oogVerhouding */
  oog: number;
  /** breedte van het gezicht gedeeld door de breedte van het beeld */
  breedteDeel: number;
  /** zekerheid van de detector, 0–1 */
  score: number;
  /** staat er nog een duidelijk gezicht in beeld (meerdereGezichten)? */
  meerdere: boolean;
}

/** De doelzone van het scherm: strenger dan de server (BEWEGING), zodat een foto die net anders valt nog doorkomt. */
export const LIVE = {
  /** eerste selfie: recht in de camera */
  rechtMax: 0.08,
  /** eerste selfie: het gezicht groot genoeg in beeld */
  minBreedteDeel: 0.2,
  minScore: 0.8,
  /** tweede selfie: vanaf hier is het hoofd ver genoeg gedraaid */
  draaiVanaf: 0.24,
  /** tweede selfie: de oogafstand mag niet verder krimpen dan dit, anders is het te ver (of een plat beeld) */
  minOog: 0.8,
} as const;

export type LiveAanwijzing = "geen-gezicht" | "een-gezicht" | "dichterbij" | "recht" | "goed" | "draai" | "te-ver";

export function liveMeting(gezicht: GemetenGezicht["gezicht"], alle: GemetenGezicht["gezicht"][], beeldBreedte: number): LiveMeting {
  return {
    draaiing: draaiing(gezicht),
    oog: oogVerhouding(gezicht),
    breedteDeel: beeldBreedte > 0 ? gezicht.breedte / beeldBreedte : 0,
    score: gezicht.score,
    meerdere: meerdereGezichten({ gezicht, alle }),
  };
}

/** De eerste selfie: kijkt de werker recht in de camera, groot genoeg en alleen? */
export function rechtAanwijzing(m: LiveMeting | null): LiveAanwijzing {
  if (!m || m.score < LIVE.minScore) return "geen-gezicht";
  if (m.meerdere) return "een-gezicht";
  if (m.breedteDeel < LIVE.minBreedteDeel) return "dichterbij";
  if (Math.abs(m.draaiing) > LIVE.rechtMax) return "recht";
  return "goed";
}

/** De tweede selfie, tegen de eerste (`recht`): verder draaien, goed, of te ver. `voortgang` 0–1 voor een balkje. */
export function draaiAanwijzing(recht: LiveMeting, m: LiveMeting | null): { aanwijzing: LiveAanwijzing; voortgang: number } {
  if (!m) return { aanwijzing: "geen-gezicht", voortgang: 0 };
  if (m.meerdere) return { aanwijzing: "een-gezicht", voortgang: 0 };
  const verschil = Math.abs(m.draaiing - recht.draaiing);
  const krimp = recht.oog > 0 ? m.oog / recht.oog : 0;
  // een ver gedraaid hoofd wordt voor de detector onzeker: dat is "te ver", niet "geen gezicht"
  if (m.score < BEWEGING.minScore) return verschil >= LIVE.draaiVanaf ? { aanwijzing: "te-ver", voortgang: 1 } : { aanwijzing: "geen-gezicht", voortgang: 0 };
  if (verschil < LIVE.draaiVanaf) return { aanwijzing: "draai", voortgang: Math.max(0, Math.min(1, verschil / LIVE.draaiVanaf)) };
  if (krimp < LIVE.minOog) return { aanwijzing: "te-ver", voortgang: 1 };
  return { aanwijzing: "goed", voortgang: 1 };
}

/**
 * Haalt de gemaakte tweede selfie de regels van de server (beoordeelBeweging, zonder de vergelijking van het
 * gezicht zelf: die doet alleen de server)? Zo niet, dan maakt het scherm gewoon een nieuwe.
 */
export function bewegingVoldoet(recht: LiveMeting, m: LiveMeting | null): boolean {
  if (!m || m.meerdere || m.score < BEWEGING.minScore) return false;
  if (Math.abs(recht.draaiing) > BEWEGING.rechtMax) return false;
  const krimp = recht.oog > 0 ? m.oog / recht.oog : 0;
  return Math.abs(m.draaiing - recht.draaiing) >= BEWEGING.minVerschil && krimp >= BEWEGING.minOogverhouding;
}
