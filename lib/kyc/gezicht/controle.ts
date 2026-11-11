// ---------------------------------------------------------------------------
// De gezichtscontrole van de ID-verificatie: de pasfoto op de voorkant van het document tegen de
// selfie. Alles gebeurt op de eigen server (lib/kyc/gezicht/motor.ts); de foto's gaan nergens heen
// en alleen de uitslag (oordeel en score) wordt bewaard, geen gezichtskenmerken.
//
// Wat een storing doet: nooit iemand afwijzen. `technisch: true` betekent "de controle kon niet
// draaien"; de verificatie gaat dan naar een medewerker, zoals zonder gezichtscontrole.
// ---------------------------------------------------------------------------

import { logger } from "@/lib/logger";
import { draaiBeeld, gezichtsKenmerk, leesBeeld, vindGezichten, type Beeld } from "@/lib/kyc/gezicht/motor";
import { grootste } from "@/lib/kyc/gezicht/detector";
import { cosinus, kwaliteitsProbleem, oordeelOverScore, type GemetenGezicht, type GezichtUitslag } from "@/lib/kyc/gezicht/vergelijk";
import { BEWEGING_NIET_AANGELEVERD, BEWEGING_NIET_BEOORDEELD, BEWEGING_ZELFDE_FOTO, beoordeelBeweging, type BewegingUitslag } from "@/lib/kyc/gezicht/beweging";

export interface GezichtControle extends GezichtUitslag {
  /** de bewegingscontrole met de tweede selfie (hoofd gedraaid), apart van de pasfoto-vergelijking */
  beweging: BewegingUitslag;
  /** de controle kon niet draaien (model, geheugen, onleesbaar bestand); geen oordeel over de persoon */
  technisch: boolean;
  /** hoeveel milliseconden de controle duurde, voor het beheer */
  ms: number;
}

async function meet(beeld: Beeld): Promise<{ meting: GemetenGezicht | null; beeld: Beeld }> {
  const alle = await vindGezichten(beeld);
  const g = grootste(alle);
  return { meting: g ? { gezicht: g, alle } : null, beeld };
}

/** De pasfoto zoeken in een document dat ook op zijn kant gefotografeerd kan zijn: eerst rechtop, dan gedraaid. */
async function zoekPasfoto(beeld: Beeld): Promise<{ meting: GemetenGezicht | null; beeld: Beeld }> {
  let gevonden = await meet(beeld);
  if (gevonden.meting) return gevonden;
  for (const graden of [90, 270, 180] as const) {
    const gedraaid = await draaiBeeld(beeld, graden);
    gevonden = await meet(gedraaid);
    if (gevonden.meting) return gevonden;
  }
  return { meting: null, beeld };
}

/**
 * De tweede selfie (hoofd gedraaid) tegen de eerste: draaide het hoofd echt, en is het dezelfde persoon?
 * Een storing hier verandert nooit de uitslag van de pasfoto-vergelijking: dan is alleen de beweging niet beoordeeld.
 */
async function bewegingVan(eerste: { meting: GemetenGezicht; kenmerk: Float32Array; bytes: Uint8Array }, tweede: Uint8Array | undefined): Promise<BewegingUitslag> {
  if (!tweede) return BEWEGING_NIET_AANGELEVERD;
  // twee keer hetzelfde bestand (bijv. uit de galerij): geen beweging, en dat zeggen we ook zo
  if (Buffer.from(eerste.bytes).equals(Buffer.from(tweede))) return BEWEGING_ZELFDE_FOTO;
  try {
    const t = await leesBeeld(tweede).then(meet);
    const kt = t.meting ? await gezichtsKenmerk(t.beeld, t.meting.gezicht) : null;
    return beoordeelBeweging(eerste.meting, t.meting, kt ? cosinus(eerste.kenmerk, kt) : null);
  } catch (err) {
    logger.warn("bewegingscontrole kon niet draaien, een medewerker beslist", { error: (err as Error).message });
    return BEWEGING_NIET_BEOORDEELD;
  }
}

/** `selfie2`: de tweede selfie met een gedraaid hoofd (bewegingscontrole); zonder die foto keurt de controle nooit zelf goed. */
export async function gezichtControle(pasfoto: Uint8Array, selfie: Uint8Array, selfie2?: Uint8Array): Promise<GezichtControle> {
  const start = Date.now();
  try {
    const [p, s] = await Promise.all([leesBeeld(pasfoto).then(zoekPasfoto), leesBeeld(selfie).then(meet)]);
    const probleem = kwaliteitsProbleem(p.meting, s.meting);
    if (probleem) return { ...probleem, technisch: false, ms: Date.now() - start, beweging: BEWEGING_NIET_BEOORDEELD };
    if (!p.meting || !s.meting) throw new Error("gezicht ontbreekt zonder kwaliteitsmelding");
    const kp = await gezichtsKenmerk(p.beeld, p.meting.gezicht);
    const ks = await gezichtsKenmerk(s.beeld, s.meting.gezicht);
    if (!kp || !ks) {
      return { beschikbaar: false, oordeel: "onbruikbaar", score: null, reden: "Het gezicht was niet goed genoeg te vergelijken. Een medewerker kijkt mee.", technisch: false, ms: Date.now() - start, beweging: BEWEGING_NIET_BEOORDEELD };
    }
    const beweging = await bewegingVan({ meting: s.meting, kenmerk: ks, bytes: selfie }, selfie2);
    return { ...oordeelOverScore(cosinus(kp, ks)), technisch: false, ms: Date.now() - start, beweging };
  } catch (err) {
    logger.warn("gezichtscontrole kon niet draaien, een medewerker beslist", { error: (err as Error).message });
    return { beschikbaar: false, oordeel: "onbruikbaar", score: null, reden: "De automatische gezichtscontrole was niet beschikbaar. Een medewerker kijkt mee.", technisch: true, ms: Date.now() - start, beweging: BEWEGING_NIET_BEOORDEELD };
  }
}
