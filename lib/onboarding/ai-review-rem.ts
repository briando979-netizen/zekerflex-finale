// ---------------------------------------------------------------------------
// Een rem op de tekst-AI van de eigen ID-controle (12 nov 2026). Gemeten: sinds 9 nov gaf hij bij 0 van de 14
// controles antwoord (het eigen model doet er 15-21 s over, de controle wacht 8 s), dus elke werker wachtte 8 s voor
// niets en elk geval gaf een waarschuwing in het foutenlogboek. Een AI zonder antwoord blokkeert de beslissing niet
// (lib/onboarding/auto-redenen.ts), dus overslaan verandert de uitkomst niet.
//
// Regel: drie keer achter elkaar geen antwoord → 6 uur overslaan (één waarschuwing). Daarna één nieuwe poging; mislukt
// die, dan meteen weer 6 uur. Eén antwoord zet de teller op nul. In het geheugen van het proces (globalThis: Next
// bundelt routes apart), en sinds 12 nov ook in de database (KV "kyc-ai-rem"): gemeten in het toegangslog wachtte
// elke insturing nog steeds 8 s (13 van 13, ook een upload van 240 kB op een laptop: 9,2 s), want er wordt een paar
// keer per dag uitgerold en er komen maar een paar insturingen per dag binnen: de rem kwam na een uitrol nooit dicht.
// ---------------------------------------------------------------------------

export const REM_NA = 3;
export const REM_DUUR_MS = 6 * 60 * 60 * 1000;

interface RemStaat {
  mislukt: number;
  dichtTot: number;
}

const g = globalThis as unknown as { __zfKycAiRem?: RemStaat; __zfKycAiRemGeladen?: Promise<void> };
const staat = (): RemStaat => (g.__zfKycAiRem ??= { mislukt: 0, dichtTot: 0 });

/** Niet per gebruiker (één rem voor het hele platform), dus geen AVG-voorvoegsel nodig. */
export const REM_KV_SLEUTEL = "kyc-ai-rem";

/**
 * Haalt de rem één keer per proces uit de database, zodat hij een uitrol overleeft. Een storing in de database
 * blokkeert niets: dan geldt alleen de rem in het geheugen (zoals vóór 12 nov).
 */
export function laadAiReviewRem(): Promise<void> {
  g.__zfKycAiRemGeladen ??= (async () => {
    try {
      const { kvGet } = await import("@/lib/storage/kv");
      const opgeslagen = await kvGet<Partial<RemStaat>>(REM_KV_SLEUTEL);
      const s = staat();
      if (typeof opgeslagen?.dichtTot === "number" && opgeslagen.dichtTot > s.dichtTot) s.dichtTot = opgeslagen.dichtTot;
      if (typeof opgeslagen?.mislukt === "number" && s.dichtTot === 0) s.mislukt = Math.max(s.mislukt, Math.min(REM_NA - 1, Math.max(0, opgeslagen.mislukt)));
    } catch {
      /* fail-open: de rem in het geheugen */
    }
  })();
  return g.__zfKycAiRemGeladen;
}

/** De stand naar de database; een storing laat de rem in het geheugen gewoon werken. */
function bewaar(): void {
  const s = { ...staat() };
  void import("@/lib/storage/kv")
    .then(({ kvSet }) => kvSet(REM_KV_SLEUTEL, s))
    .catch(() => undefined);
}

/** Nu overslaan? Is de rem net afgelopen, dan mag er één poging door die bij mislukken meteen weer remt. */
export function aiReviewOverslaan(nu: number = Date.now()): boolean {
  const s = staat();
  if (s.dichtTot === 0) return false;
  if (s.dichtTot > nu) return true;
  s.dichtTot = 0;
  s.mislukt = REM_NA - 1;
  bewaar();
  return false;
}

/** De uitslag van een poging. "dicht" = de rem ging net dicht (dan één waarschuwing in het logboek). */
export function aiReviewUitslag(gelukt: boolean, nu: number = Date.now()): "dicht" | null {
  const s = staat();
  if (gelukt) {
    s.mislukt = 0;
    s.dichtTot = 0;
    bewaar();
    return null;
  }
  s.mislukt += 1;
  if (s.mislukt < REM_NA) {
    bewaar();
    return null;
  }
  s.mislukt = 0;
  s.dichtTot = nu + REM_DUUR_MS;
  bewaar();
  return "dicht";
}

/** Voor tests. */
export function resetAiReviewRem(): void {
  g.__zfKycAiRem = { mislukt: 0, dichtTot: 0 };
  delete g.__zfKycAiRemGeladen;
}
