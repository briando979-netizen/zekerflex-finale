// ---------------------------------------------------------------------------
// Twee gezichten vergelijken: de pasfoto op het document en de selfie. Puur bestand: de beslissing
// op basis van getallen (kenmerken van SFace, de kader- en puntgegevens van YuNet). De modellen zelf
// staan in motor.ts. Elke afwijzing heeft een reden in gewoon Nederlands.
//
// Wat dit wel en niet is: een gezichtsvergelijking met een open model (SFace, 99,4% op de
// standaardtest LFW). Het is geen gecertificeerde biometrie en geen echtheidscontrole van het
// gezicht zelf; daarvoor is de bewegingscontrole (beweging.ts). De drempels hieronder zijn
// bewust streng; of ze goed liggen voor pasfoto's op echte documenten blijkt pas uit de scores
// die we bewaren naast de beslissing van een medewerker (zie scoreOverzicht in de admin).
// ---------------------------------------------------------------------------

import type { Gezicht } from "@/lib/kyc/gezicht/detector";

/** Cosinus-gelijkenis van twee kenmerken, tussen −1 en 1. 1 = identiek. */
export function cosinus(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let punt = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    punt += x * y;
    na += x * x;
    nb += y * y;
  }
  const noemer = Math.sqrt(na) * Math.sqrt(nb);
  return noemer > 0 ? punt / noemer : 0;
}

/**
 * Drempels op de cosinus. 0,363 is de waarde die OpenCV bij SFace noemt voor "dezelfde persoon".
 * Voor automatisch goedkeuren eisen we meer: een pasfoto is klein, oud en vaak glanzend.
 *
 * Bijgesteld op 11 nov 2026 van 0,50 naar 0,42, na een meting op de echte controles (op de server, alleen
 * getallen; 6 personen, 9 pogingen, gezichten grijs vergeleken). De pasfoto tegen de selfie van dezelfde
 * persoon: 0,47–0,50 bij de drie personen van de ID-scan die een medewerker goedkeurde, 0,68 bij een vierde
 * (nog in behandeling), 0,24–0,33 bij oudere losse uploads. Een pasfoto tegen de selfie van een ander (64
 * paren): gemiddeld 0,02, hoogstens 0,21. Met 0,50 haalde één van de zes de gezichtscontrole, met 0,42 vier
 * van de zes; de marge naar andere personen blijft ruim 0,2. Zelf goedkeuren vraagt daarnaast altijd een
 * paspoort of ID-kaart met een kloppende MRZ en een echte hoofddraai (lib/onboarding/verify.ts).
 */
export const GEZICHT_DREMPEL = {
  /** vanaf hier: dezelfde persoon, zeker genoeg om zonder mens door te gaan */
  zeker: 0.42,
  /** vanaf hier: aannemelijk dezelfde persoon, maar een mens kijkt mee */
  mogelijk: 0.363,
} as const;

/** Minimale kwaliteit van wat de detector vond. */
export const KWALITEIT = {
  scoreSelfie: 0.8,
  scorePasfoto: 0.6,
  /** breedte van het gezicht in pixels, in het originele beeld */
  minBreedteSelfie: 120,
  minBreedtePasfoto: 40,
  /** een tweede gezicht van minstens deze verhouding in oppervlak telt als "meer dan één gezicht" */
  tweedeGezicht: 0.4,
} as const;

export type GezichtOordeel = "zelfde" | "twijfel" | "anders" | "onbruikbaar";

export interface GezichtUitslag {
  /** is de beoordeling gelukt (beide gezichten gevonden en gemeten)? */
  beschikbaar: boolean;
  oordeel: GezichtOordeel;
  /** cosinus 0–1 (negatieve waarden worden 0), `null` als er niets te meten viel */
  score: number | null;
  /** waarom: korte tekst in gewoon Nederlands voor de medewerker en de gebruiker */
  reden: string;
  /** welk gezichtsdeel ontbrak, voor de gebruiker: "pasfoto" of "selfie" */
  probleem?: "pasfoto" | "selfie" | undefined;
}

export interface GemetenGezicht {
  gezicht: Gezicht;
  /** alle gezichten in dat beeld, voor het tellen van "meer dan één gezicht" */
  alle: Gezicht[];
}

const opp = (g: Gezicht): number => g.breedte * g.hoogte;

/** Meer dan één duidelijk gezicht in het beeld? Dan weten we niet welk bij de persoon hoort. */
export function meerdereGezichten(m: GemetenGezicht): boolean {
  return m.alle.some((g) => g !== m.gezicht && opp(g) >= opp(m.gezicht) * KWALITEIT.tweedeGezicht && g.score >= 0.6);
}

/** Kijkt of de pasfoto en de selfie goed genoeg zijn om te vergelijken. Geeft de eerste reden terug, of null. */
export function kwaliteitsProbleem(pasfoto: GemetenGezicht | null, selfie: GemetenGezicht | null): GezichtUitslag | null {
  if (!pasfoto) {
    return { beschikbaar: false, oordeel: "onbruikbaar", score: null, probleem: "pasfoto", reden: "Op de voorkant van het document is geen gezicht gevonden. Maak de foto recht van boven, zonder glans, met de pasfoto goed in beeld." };
  }
  if (pasfoto.gezicht.score < KWALITEIT.scorePasfoto || pasfoto.gezicht.breedte < KWALITEIT.minBreedtePasfoto) {
    return { beschikbaar: false, oordeel: "onbruikbaar", score: null, probleem: "pasfoto", reden: "De pasfoto op het document is te klein of te onscherp om te vergelijken. Maak de foto dichterbij en met goed licht." };
  }
  if (!selfie) {
    return { beschikbaar: false, oordeel: "onbruikbaar", score: null, probleem: "selfie", reden: "Op de selfie is geen gezicht gevonden. Houd je gezicht vol in beeld, met goed licht van voren." };
  }
  if (selfie.gezicht.score < KWALITEIT.scoreSelfie || selfie.gezicht.breedte < KWALITEIT.minBreedteSelfie) {
    return { beschikbaar: false, oordeel: "onbruikbaar", score: null, probleem: "selfie", reden: "Je gezicht is op de selfie te klein of te onscherp. Houd de telefoon dichterbij en zorg voor goed licht." };
  }
  if (meerdereGezichten(selfie)) {
    return { beschikbaar: false, oordeel: "onbruikbaar", score: null, probleem: "selfie", reden: "Er staat meer dan één gezicht op de selfie. Maak de selfie alleen." };
  }
  return null;
}

/** De beslissing op basis van de gelijkenis. */
export function oordeelOverScore(cos: number): GezichtUitslag {
  const score = Math.max(0, Math.min(1, cos));
  if (cos >= GEZICHT_DREMPEL.zeker) {
    return { beschikbaar: true, oordeel: "zelfde", score, reden: "Het gezicht op de selfie komt overeen met de pasfoto op het document." };
  }
  if (cos >= GEZICHT_DREMPEL.mogelijk) {
    return { beschikbaar: true, oordeel: "twijfel", score, reden: "Het gezicht op de selfie lijkt op de pasfoto, maar niet zeker genoeg. Een medewerker kijkt mee." };
  }
  return { beschikbaar: true, oordeel: "anders", score, reden: "Het gezicht op de selfie lijkt niet op de pasfoto op het document. Een medewerker kijkt mee." };
}

/**
 * Hoe ver het gezicht naar links of rechts gedraaid is, uit de vijf punten. 0 = recht in de camera,
 * negatief = de neus staat links van het midden van de ogen (in het beeld), positief = rechts.
 * Gedeeld door de afstand tussen de ogen, dus onafhankelijk van hoe dichtbij de camera is.
 */
export function draaiing(g: Gezicht): number {
  const [oogL, oogR, neus] = g.punten;
  const afstand = Math.hypot(oogR.x - oogL.x, oogR.y - oogL.y);
  if (afstand < 1) return 0;
  const midden = (oogL.x + oogR.x) / 2;
  return (neus.x - midden) / afstand;
}
