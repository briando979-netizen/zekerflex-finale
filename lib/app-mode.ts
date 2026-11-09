// ---------------------------------------------------------------------------
// Android app (TWA) mode. The app always launches /start?utm_source=twa and
// middleware.ts then sets APP_COOKIE. Some features are web-only because the
// Play Store treats them as regulated financial or reward features:
//   - ZekerFlex Bank, betaalverzoeken, voorschot, snellere uitbetaling
//     ("Financiële functies" declaration needs licence proof)
//   - the referral cash bonus (gives the app an 18+ IARC rating)
// Shared by middleware, server components and client components — keep this
// file free of server-only imports.
// ---------------------------------------------------------------------------

export const APP_COOKIE = "zf_app";

/** Paths that are off-limits inside the app — bounced to /start. */
export const APP_BLOCKED_PATHS = ["/dashboard/bank", "/werkgever/bank", "/betaalverzoek"];

/**
 * ZekerFlex Bank staat uit (7 nov 2026), voor iedereen, niet alleen in de app:
 * een tegoed bewaren vraagt een vergunning (e-geld), Stripe gaf geen passen en
 * er is geen verzekeraar. Verdiensten gaan altijd naar de eigen IBAN. Daarmee
 * vallen ook weg wat alleen via de bank liep: betaalverzoeken, het voorschot op
 * de bank, de doorverwijsbonus (werd op de bank gestort), potjes, vaste
 * opdrachten en de bankkosten. De boekhouding (lib/bank) en de gegevens blijven
 * staan; deze schakelaar weer op true zet alles terug.
 */
export const BANK_AAN = false;

/** De schermen en API's van de bank (niet /api/me/bank-verify: dat is je eigen rekening bevestigen). */
const BANK_PATHS = ["/dashboard/bank", "/werkgever/bank", "/betaalverzoek", "/api/me/bank", "/api/betaal/verzoek"];

/** Dicht omdat de bank uit staat (BANK_AAN). */
export function isBankPath(pathname: string): boolean {
  return !BANK_AAN && BANK_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function isAppBlockedPath(pathname: string): boolean {
  return APP_BLOCKED_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** True when a raw `document.cookie` / Cookie header string carries the app cookie. */
/**
 * De Android-app kan sinds versie 1.0.4 de chip van een paspoort of ID-kaart
 * lezen (NFC, ChipActivity). Zo'n app start met /start?utm_source=twa&chip=1;
 * de middleware zet dan deze cookie. Oudere apps en de website zien de stap niet.
 */
export const APP_CHIP_COOKIE = "zf_app_chip";

/** True wanneer de cookie-tekst zegt dat deze app de chip kan lezen. */
export function cookieStringHasChip(cookie: string | null | undefined): boolean {
  return /(?:^|;\s*)zf_app_chip=1(?:;|$)/.test(cookie ?? "");
}

/** De Android-app die de chip kan lezen (beide cookies): alleen dan mag de server de sleutel voor de chip bewaren. */
export function appKanChipLezen(cookie: string | null | undefined): boolean {
  return cookieStringIsApp(cookie) && cookieStringHasChip(cookie);
}

export function cookieStringIsApp(cookie: string | null | undefined): boolean {
  return /(?:^|;\s*)zf_app=1(?:;|$)/.test(cookie ?? "");
}
