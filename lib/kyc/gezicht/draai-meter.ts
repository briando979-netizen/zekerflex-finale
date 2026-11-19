// ---------------------------------------------------------------------------
// De hoofddraai-meter (18 nov 2026, eigenaar: "maak een duidelijke animatie met hoofd draaien, een beweging die laat
// zien tot hoever ze hun hoofd moeten bewegen, tot de foto automatisch gemaakt kan worden"). Aanleiding: pogingen
// die naar een mens gingen met "niet-gedraaid" (draai −0,088 waar 0,18 nodig is). Puur bestand, voor de meter op het
// scherm (components/app/HoofdDraai.tsx) en de test. De drempels zelf staan in beweging.ts en veranderen hier niet;
// dit vertaalt alleen de live meting naar een stand voor de wijzer en bepaalt wanneer de foto vanzelf mag.
// ---------------------------------------------------------------------------
import { LIVE, type LiveMeting } from "@/lib/kyc/gezicht/beweging";

/**
 * Zoveel beelden achter elkaar (±2 per seconde) moet het hoofd goed staan voordat de foto vanzelf gaat. Eén (19 nov 2026):
 * bij de eerste echte pogingen schoot het hoofd in 1 tot 3 s door het doel heen (1 tussenstand in de reeks) en kwam er in
 * 60 beelden nooit twee keer achter elkaar "goed"; de foto wordt daarna toch nog nagemeten (bewegingVoldoet), dus één
 * goed beeld is genoeg.
 */
export const DRAAI_STABIELE_BEELDEN = 1;

/** Vanaf dit deel van de doelhoek ligt de foto op volle grootte al klaar vóór de meting van datzelfde beeld (IdScan). */
export const VOORBEREID_VANAF = 0.5;

/** De boog van de meter loopt tot 1,25 keer de doelhoek: een klein groen stuk voorbij "tot hier". */
export const METER_MAX = 1.25;
/** De wijzer zelf komt nooit voorbij "tot hier" (19 nov 2026: een wijzer die doorliep nodigde uit om door te draaien). */
export const NAALD_MAX = 1;
/** De halve boog van de meter in graden: de wijzer gaat van −BOOG tot +BOOG. */
export const METER_BOOG = 70;

export interface DraaiStand {
  /** hoe ver het hoofd nu gedraaid is ten opzichte van de eerste selfie, als deel van de doelhoek (1 = tot hier); met teken */
  fractie: number;
  /** naar welke kant, vanuit de camera gezien: −1 links, 1 rechts, 0 nog niet of onbekend */
  richting: -1 | 0 | 1;
  /** de doelhoek is gehaald en het gezicht is nog goed in beeld */
  goed: boolean;
  /** verder gedraaid dan de camera aankan (oogafstand te veel gekrompen of het gezicht te onzeker) */
  teVer: boolean;
  /** geen bruikbaar gezicht in beeld */
  geenGezicht: boolean;
}

export const DRAAI_LEEG: DraaiStand = { fractie: 0, richting: 0, goed: false, teVer: false, geenGezicht: true };

/** De stand van de wijzer uit de live meting, tegen de eerste selfie (`recht`). */
export function draaiStand(recht: LiveMeting, m: LiveMeting | null): DraaiStand {
  if (!m || m.meerdere) return DRAAI_LEEG;
  const verschil = m.draaiing - recht.draaiing;
  const fractie = LIVE.draaiVanaf > 0 ? verschil / LIVE.draaiVanaf : 0;
  const richting: -1 | 0 | 1 = Math.abs(fractie) < 0.08 ? 0 : fractie < 0 ? -1 : 1;
  const krimp = recht.oog > 0 ? m.oog / recht.oog : 0;
  const gehaald = Math.abs(fractie) >= 1;
  if (m.score < LIVE.minScore) return gehaald ? { fractie, richting, goed: false, teVer: true, geenGezicht: false } : DRAAI_LEEG;
  const teVer = gehaald && krimp < LIVE.minOog;
  return { fractie, richting, goed: gehaald && !teVer, teVer, geenGezicht: false };
}

/** De hoek van de wijzer in graden (negatief = links), begrensd op "tot hier" (NAALD_MAX). */
export function naaldHoek(fractie: number): number {
  const f = Math.max(-NAALD_MAX, Math.min(NAALD_MAX, fractie));
  return Math.round((f / METER_MAX) * METER_BOOG * 10) / 10;
}

/** Toont de meter "STOP"? Zodra het doel gehaald is (goed, of te ver): niet verder draaien. */
export function stopTonen(stand: DraaiStand): boolean {
  return stand.goed || stand.teVer || (!stand.geenGezicht && Math.abs(stand.fractie) >= 1);
}

/** De hoek van de markering "tot hier" (één kant; de andere kant is het spiegelbeeld). */
export const DOEL_HOEK = naaldHoek(1);

/** Telt goede beelden achter elkaar; één slecht beeld begint opnieuw. */
export function telStabiel(teller: number, goed: boolean): number {
  return goed ? teller + 1 : 0;
}

/** Mag de foto vanzelf: de doelhoek is DRAAI_STABIELE_BEELDEN beelden achter elkaar gehaald. */
export function fotoMag(teller: number): boolean {
  return teller >= DRAAI_STABIELE_BEELDEN;
}

/** Zo vaak mag het scherm een knopfoto van de tweede selfie weigeren; daarna gaat hij door en beslissen de server en een mens. */
export const KNOP_MAX_AFGEWEZEN = 2;

/**
 * Mag de foto die de werker zelf met de knop maakte door? (19 nov 2026: de eerste twee echte pogingen na de meter waren
 * knopfoto's; tijdens het aftellen draaide het hoofd door tot 0,41 en 0,88 bij een doel van 0,24, en de server keurde ze
 * af als "platgedrukt".) `voldoet` is de uitkomst van bewegingVoldoet op de knopfoto, of null als die niet te meten was:
 * dan door. Na KNOP_MAX_AFGEWEZEN weigeringen ook door, zodat niemand vast komt te zitten.
 */
export function knopAccepteert(voldoet: boolean | null, afgewezen: number): boolean {
  return voldoet !== false || afgewezen >= KNOP_MAX_AFGEWEZEN;
}
