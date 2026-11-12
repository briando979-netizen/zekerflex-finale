// ---------------------------------------------------------------------------
// Mag de eigen ID-controle zelf goedkeuren, en zo niet: waarom niet? Puur bestand.
//
// De eigenaar (12 nov 2026): "ik wil niet meer handmatig hoeven beoordelen tenzij het echt niet anders is".
// Daarom beslist deze ene functie, en dezelfde lijst redenen staat bij de controle in het beheer en in de
// melding aan de eigenaar. Zelf goedkeuren = de lijst is leeg (en niets is hard afgewezen, zie verify.ts).
//
// Wat altijd een mens blijft (echt niet anders):
//  - geen leesbare code op het document (MRZ) of een rijbewijs (geen code): dan is niet zeker dat het document klopt;
//  - het gezicht lijkt niet zeker genoeg op de pasfoto, of het hoofd draaide niet echt (een foto van een foto);
//  - foto's via "verder op je telefoon" (QR): een doorgestuurde link kan bij een ander uitkomen (review H1);
//  - geen EU/EER/CH-nationaliteit (Wet arbeid vreemdelingen), of jonger dan 18;
//  - hetzelfde document of dezelfde chip al bij een ander account.
// De tekst-AI ziet alleen wat iemand typte: als de foto's en de code op het document alles bevestigen, houdt alleen
// een uitdrukkelijk "afgekeurd" van die AI de goedkeuring tegen (sinds 12 nov; daarvoor ook "bekijk handmatig").
// ---------------------------------------------------------------------------

import { GEZICHT_DREMPEL } from "@/lib/kyc/gezicht/vergelijk";

export interface AutoFeiten {
  kvkOk: boolean;
  naamOk: boolean;
  nummerFormaatOk: boolean;
  geldigOk: boolean;
  rijbewijs: boolean;
  mrzGeldig: boolean;
  mrzNummerOk: boolean;
  mrzNaamOk: boolean;
  chipFotoVerschil: boolean;
  werkrecht: "vrij" | "controle" | null;
  leeftijd: "volwassen" | "minderjarig" | "te-jong" | null;
  viaTweedeToestel: boolean;
  telefoonGeweigerd: boolean;
  dubbelDocument: boolean;
  zegelElders: boolean;
  /** de vlag id-gezicht-automatisch */
  gezichtAutomatischAan: boolean;
  gezichtOordeel: string;
  gezichtScore: number | null;
  bewegingOordeel: string;
  /** het oude beeldmodel (LLM_VISION_MODEL) keurde document en gezicht goed */
  beeldmodelOk: boolean;
  aiVerdict: "approved" | "needs_review" | "rejected";
  /** de tekst-AI keurde goed met genoeg zekerheid (>= 0,65) */
  aiZeker: boolean;
}

const BEWEGING_TEKST: Record<string, string> = {
  "niet-aangeleverd": "er is geen tweede selfie met een gedraaid hoofd",
  "niet-gedraaid": "het hoofd draaide niet (genoeg) op de tweede selfie",
  onnatuurlijk: "de tweede selfie ziet er platgedrukt uit (mogelijk een foto of scherm)",
  "niet-recht": "op de eerste selfie keek de werker niet recht in de camera",
  "andere-persoon": "de twee selfies lijken niet op dezelfde persoon",
  "geen-gezicht": "op de tweede selfie is geen gezicht gevonden",
  "te-onzeker": "het gezicht op de tweede selfie is te klein of te onscherp",
  "niet-beoordeeld": "de bewegingscontrole kon niet draaien",
};

/** Kijkt de eigen gezichtscontrole (pasfoto tegen selfie, met echte hoofddraai) zeker genoeg om zelf goed te keuren? */
export function gezichtBeslist(f: AutoFeiten): boolean {
  return f.gezichtAutomatischAan && f.gezichtOordeel === "zelfde" && f.bewegingOordeel === "ok" && !f.rijbewijs && f.mrzGeldig;
}

/** Waarom deze controle niet zelf goedkeurt, in gewoon Nederlands; leeg = zelf goedkeuren. */
export function redenenNietAutomatisch(f: AutoFeiten): string[] {
  const r: string[] = [];
  if (!f.kvkOk) r.push("het KVK- of btw-nummer is niet bevestigd");
  if (!f.naamOk) r.push("de getypte naam wijkt af van de accountnaam");
  if (!f.nummerFormaatOk) r.push("het documentnummer heeft niet het verwachte formaat");
  if (!f.geldigOk) r.push("het document is verlopen of de datum is ongeldig");
  if (f.rijbewijs) r.push("een rijbewijs heeft geen code (MRZ) en telt niet als ID voor betaald werk");
  else if (!f.mrzGeldig) r.push("de code onderop het document (MRZ) is niet zeker gelezen");
  else {
    if (!f.mrzNummerOk) r.push("het getypte documentnummer wijkt af van het nummer op het document");
    if (!f.mrzNaamOk) r.push("de naam op het document wijkt af van de accountnaam");
    if (f.werkrecht !== "vrij") r.push(f.werkrecht === "controle" ? "geen EU/EER/CH-nationaliteit: het recht om te werken moet gecontroleerd worden" : "de nationaliteit is niet te lezen");
    if (f.leeftijd !== "volwassen") r.push(f.leeftijd === "minderjarig" || f.leeftijd === "te-jong" ? "de werker is jonger dan 18" : "de leeftijd is niet te lezen");
  }
  if (f.chipFotoVerschil) r.push("de chip hoort bij een ander document dan de foto's");
  if (f.viaTweedeToestel) r.push("ingestuurd via 'verder op je telefoon' (QR-code): dan kijkt altijd een mens, want een doorgestuurde link kan bij een ander uitkomen");
  if (f.telefoonGeweigerd) r.push("een telefoon koos 'dit is niet mijn account' voor dit account");
  if (f.dubbelDocument) r.push("dit document is al bij een ander account gebruikt");
  if (f.zegelElders) r.push("deze chip is al bij een ander account gebruikt");

  const gezichtOk = gezichtBeslist(f);
  const fotosOk = f.beeldmodelOk || gezichtOk;
  if (!fotosOk && !f.rijbewijs) {
    if (!f.gezichtAutomatischAan) r.push("automatisch goedkeuren op het gezicht staat uit (Admin → Vlaggen, id-gezicht-automatisch)");
    if (f.gezichtOordeel !== "zelfde") {
      r.push(
        f.gezichtScore !== null
          ? `het gezicht lijkt ${Math.round(f.gezichtScore * 100)}% op de pasfoto (zeker vanaf ${Math.round(GEZICHT_DREMPEL.zeker * 100)}%)`
          : "het gezicht was niet te vergelijken met de pasfoto",
      );
    }
    if (f.bewegingOordeel !== "ok") r.push(`hoofd draaien: ${BEWEGING_TEKST[f.bewegingOordeel] ?? f.bewegingOordeel}`);
  }
  // de tekst-AI: met sluitend bewijs van foto's en document telt alleen een uitdrukkelijke afkeuring
  const aiOk = gezichtOk ? f.aiVerdict !== "rejected" : f.aiZeker;
  if (fotosOk && !aiOk) r.push(f.aiVerdict === "rejected" ? "de automatische beoordeling zag een tegenstrijdigheid in de gegevens" : "de automatische beoordeling keurde niet zeker goed");
  return r;
}
