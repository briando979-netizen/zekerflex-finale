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

export interface GezichtControle extends GezichtUitslag {
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

export async function gezichtControle(pasfoto: Uint8Array, selfie: Uint8Array): Promise<GezichtControle> {
  const start = Date.now();
  try {
    const [p, s] = await Promise.all([leesBeeld(pasfoto).then(zoekPasfoto), leesBeeld(selfie).then(meet)]);
    const probleem = kwaliteitsProbleem(p.meting, s.meting);
    if (probleem) return { ...probleem, technisch: false, ms: Date.now() - start };
    if (!p.meting || !s.meting) throw new Error("gezicht ontbreekt zonder kwaliteitsmelding");
    const kp = await gezichtsKenmerk(p.beeld, p.meting.gezicht);
    const ks = await gezichtsKenmerk(s.beeld, s.meting.gezicht);
    if (!kp || !ks) {
      return { beschikbaar: false, oordeel: "onbruikbaar", score: null, reden: "Het gezicht was niet goed genoeg te vergelijken. Een medewerker kijkt mee.", technisch: false, ms: Date.now() - start };
    }
    return { ...oordeelOverScore(cosinus(kp, ks)), technisch: false, ms: Date.now() - start };
  } catch (err) {
    logger.warn("gezichtscontrole kon niet draaien, een medewerker beslist", { error: (err as Error).message });
    return { beschikbaar: false, oordeel: "onbruikbaar", score: null, reden: "De automatische gezichtscontrole was niet beschikbaar. Een medewerker kijkt mee.", technisch: true, ms: Date.now() - start };
  }
}
