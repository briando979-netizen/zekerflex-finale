// ---------------------------------------------------------------------------
// Welke aansporing staat bovenaan /dashboard/klussen (13 nov 2026)? Hooguit één tegelijk.
//  - "Meldingen aanzetten" (de pushkaart: components/app/PushToggle.tsx, variant banner): voor een geverifieerde werker bij
//    wie van "Maak een goede eerste indruk" alleen de stap meldingen nog open staat. Hij vervangt dan die kaart: dezelfde
//    stap, maar meteen met de knop. Op het apparaat zelf verdwijnt hij als meldingen daar al aanstaan of niet kunnen, in de
//    iPhone-app (daar vraagt de app zelf), en na wegklikken (na 14 dagen terug).
//  - "Ken je een bedrijf dat mensen zoekt?" (lib/klusconcept/via.ts tipPlek): bovenaan bij een lijst zonder echte klussen,
//    maar onderaan zodra de pushkaart er staat.
// Puur bestand: de pagina en tests/push-kaart-klussen.test.ts gebruiken het.
// ---------------------------------------------------------------------------

export interface KlussenKaartFeiten {
  /** de ID-controle is goedgekeurd (kycStatus VERIFIED) */
  geverifieerd: boolean;
  /** de stand van "Maak een goede eerste indruk" (heeftMeldingen is ook waar in de iPhone-app en zonder web-push); null tijdens de onboarding of bij een storing */
  eersteIndruk: { open: number; heeftMeldingen: boolean } | null;
  /** net terug van /dashboard/eerste-indruk (?eerste=1): dan staat daar de melding, geen kaart */
  netOpgeslagen: boolean;
  /** waar de tipkaart uit zichzelf zou staan */
  tipPlek: "boven" | "onder";
}

export interface KlussenKaarten {
  push: boolean;
  eersteIndruk: boolean;
  tip: "boven" | "onder";
}

export function klussenKaarten(f: KlussenKaartFeiten): KlussenKaarten {
  const stand = f.netOpgeslagen ? null : f.eersteIndruk;
  // alleen de stap meldingen staat nog open
  const push = f.geverifieerd && stand !== null && !stand.heeftMeldingen && stand.open === 1;
  return {
    push,
    eersteIndruk: !push && stand !== null && stand.open > 0,
    tip: push ? "onder" : f.tipPlek,
  };
}
