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

export function isAppBlockedPath(pathname: string): boolean {
  return APP_BLOCKED_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** True when a raw `document.cookie` / Cookie header string carries the app cookie. */
export function cookieStringIsApp(cookie: string | null | undefined): boolean {
  return /(?:^|;\s*)zf_app=1(?:;|$)/.test(cookie ?? "");
}
