// ---------------------------------------------------------------------------
// Een rem op de tekst-AI van de eigen ID-controle (12 nov 2026). Gemeten: sinds 9 nov gaf hij bij 0 van de 14
// controles antwoord (het eigen model doet er 15-21 s over, de controle wacht 8 s), dus elke werker wachtte 8 s voor
// niets en elk geval gaf een waarschuwing in het foutenlogboek. Een AI zonder antwoord blokkeert de beslissing niet
// (lib/onboarding/auto-redenen.ts), dus overslaan verandert de uitkomst niet.
//
// Regel: drie keer achter elkaar geen antwoord → 6 uur overslaan (één waarschuwing). Daarna één nieuwe poging; mislukt
// die, dan meteen weer 6 uur. Eén antwoord zet de teller op nul. In het geheugen van het proces (globalThis: Next
// bundelt routes apart), dus na een uitrol begint hij opnieuw.
// ---------------------------------------------------------------------------

export const REM_NA = 3;
export const REM_DUUR_MS = 6 * 60 * 60 * 1000;

interface RemStaat {
  mislukt: number;
  dichtTot: number;
}

const g = globalThis as unknown as { __zfKycAiRem?: RemStaat };
const staat = (): RemStaat => (g.__zfKycAiRem ??= { mislukt: 0, dichtTot: 0 });

/** Nu overslaan? Is de rem net afgelopen, dan mag er één poging door die bij mislukken meteen weer remt. */
export function aiReviewOverslaan(nu: number = Date.now()): boolean {
  const s = staat();
  if (s.dichtTot === 0) return false;
  if (s.dichtTot > nu) return true;
  s.dichtTot = 0;
  s.mislukt = REM_NA - 1;
  return false;
}

/** De uitslag van een poging. "dicht" = de rem ging net dicht (dan één waarschuwing in het logboek). */
export function aiReviewUitslag(gelukt: boolean, nu: number = Date.now()): "dicht" | null {
  const s = staat();
  if (gelukt) {
    s.mislukt = 0;
    s.dichtTot = 0;
    return null;
  }
  s.mislukt += 1;
  if (s.mislukt < REM_NA) return null;
  s.mislukt = 0;
  s.dichtTot = nu + REM_DUUR_MS;
  return "dicht";
}

/** Voor tests. */
export function resetAiReviewRem(): void {
  g.__zfKycAiRem = { mislukt: 0, dichtTot: 0 };
}
