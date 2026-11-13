// ---------------------------------------------------------------------------
// /login voor wie al ingelogd is (13 nov). Van de nieuwe werkers met /login als laatste pagina waren er twee
// nog gewoon ingelogd: de terugknop na het inloggen, "Inloggen" in de kop of de knop in de welkomstmail gaf
// ze het formulier, alsof ze uitgelogd waren. Met een volledige sessie (getPrincipal: geldig token, account
// bestaat en is niet uitgeschakeld; de tweestap is dan al gedaan, want pas daarna komt er een sessie) stuurt
// de pagina ze door. Een half of kapot cookie geeft getPrincipal() null en dus gewoon het formulier: geen lus.
// Puur bestand.
// ---------------------------------------------------------------------------

/** De schermen van het inloggen zelf: daarheen doorsturen geeft een lus of weer hetzelfde formulier. */
const INLOGSCHERMEN = ["/login", "/register", "/welkom", "/wachtwoord-vergeten", "/wachtwoord-herstellen"] as const;

/**
 * Waarheen een ingelogde bezoeker van /login gaat: een eigen pad uit callbackUrl, anders /start (die kiest per
 * rol: beheer → /admin, verkoop → /sales, opdrachtgever → /werkgever, werker → /dashboard, mail nog niet
 * bevestigd → /verifieer-email). Een verkeerde rol voor het doel stuurt de middleware zelf naar /start.
 */
export function doelAlIngelogd(callbackUrl: string | undefined): string {
  if (!callbackUrl) return "/start";
  // alleen een pad op onze eigen site; geen //host, geen backslash, en geen tab, regeleinde of spatie
  // (een browser haalt tab en regeleinde weg, waarna "/\t/x.nl" toch "//x.nl" wordt)
  if (!callbackUrl.startsWith("/") || callbackUrl.startsWith("//") || callbackUrl.includes("\\")) return "/start";
  if ([...callbackUrl].some((c) => c <= " " || c === "\u007f")) return "/start";
  const pad = callbackUrl.split(/[?#]/)[0] ?? "";
  if (INLOGSCHERMEN.some((s) => pad === s || pad.startsWith(`${s}/`))) return "/start";
  return callbackUrl;
}

/**
 * Of /login doorstuurt en waarheen; null = het formulier tonen. Met een foutmelding in het adres (bijv. een
 * mislukte koppeling met Google) blijft het formulier staan, anders ziet niemand die melding.
 */
export function doorsturenAlsIngelogd(
  ingelogd: boolean,
  zoek: { callbackUrl?: string | undefined; error?: string | undefined },
): string | null {
  if (!ingelogd || zoek.error) return null;
  return doelAlIngelogd(zoek.callbackUrl);
}
