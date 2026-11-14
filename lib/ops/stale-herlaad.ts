// De herlaad-beveiliging na een uitrol (zie lib/ops/stale-deployment.ts): een tabblad van voor de uitrol herlaadt zichzelf EENMAAL, en een
// blijvende fout belandt niet in een herlaad-lus. Puur (geen imports), zodat de foutgrenzen in de browser (app/error.tsx en app/admin/error.tsx)
// en de test hem delen.

export const STALE_HERLAAD_SLEUTEL = "zf-stale-reload";
/** Hooguit één herlading per zoveel milliseconden per tabblad. */
export const STALE_HERLAAD_MIN_MS = 10_000;

export interface TabOpslag {
  getItem(sleutel: string): string | null;
  setItem(sleutel: string, waarde: string): void;
}

/**
 * Mag dit tabblad nu herladen? Ja als er in de laatste 10 seconden niet is herladen; de tijd van deze herlading wordt dan onthouden.
 * Zonder werkende opslag (geblokkeerd) nee: een herlaad-lus is erger dan de knop "Pagina vernieuwen".
 */
export function magStaleHerladen(opslag: TabOpslag | null, nu: number): boolean {
  if (!opslag) return false;
  try {
    const laatste = Number(opslag.getItem(STALE_HERLAAD_SLEUTEL) ?? "0");
    if (Number.isFinite(laatste) && nu - laatste <= STALE_HERLAAD_MIN_MS) return false;
    opslag.setItem(STALE_HERLAAD_SLEUTEL, String(nu));
    return true;
  } catch {
    return false;
  }
}

/** De sessionStorage van dit tabblad, of null als de browser hem blokkeert. */
export function tabOpslag(): TabOpslag | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}