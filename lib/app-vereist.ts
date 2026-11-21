// De werker-omgeving (/dashboard) gebruik je sinds 21 nov 2026 alleen in de app, zoals bij YoungOnes (eigenaar:
// "vanaf nu moeten ze de app installeren willen ze gebruik maken van het werkersdashboard; voor nu de testapp").
// Werkgevers houden de website. Puur bestand: de poort (server), het scherm (client) en de tests lezen dit allebei.

/** Cookie die een geïnstalleerde web-app (PWA, standalone) zet zodra ze open is: daarna telt de browser als app. */
export const PWA_COOKIE = "zf_pwa";
export const PWA_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** De Android-app (com.zekerflex.app) staat in Google Play als testversie; de link werkt voor testers. */
export const PLAY_TEST_URL = "https://play.google.com/apps/testing/com.zekerflex.app";
/** De iPhone-app als testversie in TestFlight (openbare link). */
export const TESTFLIGHT_URL = "https://testflight.apple.com/join/2QKhAHn8";

/** Draait de pagina als geïnstalleerde app (Android/Chrome standalone of iOS Safari "Zet op beginscherm")? */
export function isStandaloneBrowser(w: Pick<Window, "matchMedia" | "navigator"> | undefined): boolean {
  if (!w) return false;
  const standalone = w.matchMedia?.("(display-mode: standalone)")?.matches ?? false;
  const ios = Boolean((w.navigator as Navigator & { standalone?: boolean }).standalone);
  return standalone || ios;
}

/** Mag deze bezoeker de werker-omgeving in de browser zien? Alleen in de app, in een geïnstalleerde web-app, of als beheerder. */
export function werkerOmgevingToegestaan(f: { inApp: boolean; pwaCookie: boolean; beheerder: boolean }): boolean {
  return f.inApp || f.pwaCookie || f.beheerder;
}
