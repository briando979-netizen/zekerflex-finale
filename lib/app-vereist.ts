// De werker-omgeving (/dashboard) en de app. 21 nov 2026 (eigenaar, zoals YoungOnes): alleen in de app. 22 nov 2026 (eigenaar,
// na het gebruikersonderzoek: "eerst browser, dan app"): de app staat nog alleen in een testprogramma (Android via een
// Google-groep, iPhone via TestFlight) en bijna iedereen haakte af op het scherm "Installeer de app". Daarom staat "alleen in de
// app" nu achter de vlag ALLEEN_APP_VLAG (lib/flags, standaard uit): de werker doet zijn startstappen en bekijkt de klussen in
// de browser, en krijgt daarna een wegklikbaar voorstel om de app te installeren (components/app/AppVoorstelKaart.tsx).
// Staat de app gewoon in de winkels, dan zet de vlag aan in Beheer → Vlaggen het oude gedrag terug, zonder uitrol.
// Werkgevers houden de website. Puur bestand: de poort (server), de schermen (client) en de tests lezen dit allemaal.

/** De vlag in lib/flags: aan = de werker-omgeving alleen in de app (in een gewone browser het scherm "Installeer de app"). */
export const ALLEEN_APP_VLAG = "werker-alleen-app";

/** Cookie die een geïnstalleerde web-app (PWA, standalone) zet zodra ze open is: daarna telt de browser als app. */
export const PWA_COOKIE = "zf_pwa";
export const PWA_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** De Android-app (com.zekerflex.app) staat in Google Play als testversie; de link werkt voor testers. */
export const PLAY_TEST_URL = "https://play.google.com/apps/testing/com.zekerflex.app";
/** De iPhone-app als testversie in TestFlight (openbare link). */
export const TESTFLIGHT_URL = "https://testflight.apple.com/join/2QKhAHn8";
/** De Google-groep van de testers: wie lid wordt, mag de Android-testversie meteen installeren (Play: testtrack via de groep, 22 nov 2026). */
export const TESTGROEP_URL = "https://groups.google.com/g/zekerflex-testers";
/** Waar de QR-code op de computer naartoe gaat: de appspagina, met per toestel de weg naar de app (22 nov 2026). */
export const APP_PAGINA_URL = "https://zekerflex.com/app";

/** Draait de pagina als geïnstalleerde app (Android/Chrome standalone of iOS Safari "Zet op beginscherm")? */
export function isStandaloneBrowser(w: Pick<Window, "matchMedia" | "navigator"> | undefined): boolean {
  if (!w) return false;
  const standalone = w.matchMedia?.("(display-mode: standalone)")?.matches ?? false;
  const ios = Boolean((w.navigator as Navigator & { standalone?: boolean }).standalone);
  return standalone || ios;
}

export type Toestel = "iphone" | "android" | "computer";

/**
 * Welke weg naar de app hoort bij dit toestel? Per toestel één weg (22 nov 2026): een iPhone ziet geen Android-stappen en
 * andersom; een computer krijgt een QR-code. Een iPad met iPadOS doet zich voor als Mac, maar heeft een aanraakscherm.
 */
export function toestelVan(n: { userAgent: string; platform?: string; maxTouchPoints?: number }): Toestel {
  if (/iphone|ipad|ipod/i.test(n.userAgent)) return "iphone";
  if (n.platform === "MacIntel" && (n.maxTouchPoints ?? 0) > 1) return "iphone";
  if (/android/i.test(n.userAgent)) return "android";
  return "computer";
}

/**
 * Mag deze bezoeker de werker-omgeving zien? Met de vlag uit (standaard sinds 22 nov 2026) altijd, ook in een gewone browser.
 * Met de vlag aan alleen in de app, in een geïnstalleerde web-app, of als beheerder.
 */
export function werkerOmgevingToegestaan(f: { alleenApp: boolean; inApp: boolean; pwaCookie: boolean; beheerder: boolean }): boolean {
  if (!f.alleenApp) return true;
  return f.inApp || f.pwaCookie || f.beheerder;
}
