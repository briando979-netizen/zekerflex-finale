// ---------------------------------------------------------------------------
// De hoofddraai-meter (18 nov 2026, eigenaar: "maak een duidelijke animatie met hoofd draaien, een beweging die laat
// zien tot hoever ze hun hoofd moeten bewegen, tot de foto automatisch gemaakt kan worden"). Aanleiding: pogingen
// die naar een mens gingen met "niet-gedraaid" (draai −0,088 waar 0,18 nodig is). Puur bestand, voor de meter op het
// scherm (components/app/HoofdDraai.tsx) en de test. De drempels zelf staan in beweging.ts en veranderen hier niet;
// dit vertaalt alleen de live meting naar een stand voor de wijzer en bepaalt wanneer de foto vanzelf mag.
// ---------------------------------------------------------------------------
import { LIVE, type LiveMeting } from "@/lib/kyc/gezicht/beweging";

/** Zoveel beelden achter elkaar (±2 per seconde) moet het hoofd goed staan voordat de foto vanzelf gaat. */
export const DRAAI_STABIELE_BEELDEN = 2;

/** De meter loopt tot 1,5 keer de doelhoek; daarboven is het hoe dan ook "te ver". */
export const METER_MAX = 1.5;
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

/** De hoek van de wijzer in graden (negatief = links), begrensd op de meter. */
export function naaldHoek(fractie: number): number {
  const f = Math.max(-METER_MAX, Math.min(METER_MAX, fractie));
  return Math.round((f / METER_MAX) * METER_BOOG * 10) / 10;
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
