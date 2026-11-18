// ---------------------------------------------------------------------------
// Adressen die op een bedrijfssite staan maar nooit van het bedrijf zijn: de
// sleutel van een foutenmelder (…@o1308802.ingest.sentry.io, 17 nov 2026 als
// "emailFound" van een careers-crawl), het adres van de webbouwer of het
// platform, een voorbeeldadres, of een bestandsnaam die op een adres lijkt.
// Puur bestand (geen netwerk, geen prisma): de careers-crawler en de
// contactverrijker gebruiken dezelfde regels.
// ---------------------------------------------------------------------------

/** Diensten waarvan een adres (of een sleutel in adresvorm) in de HTML van een klantsite staat; een subdomein telt mee. */
export const ROMMEL_DOMEINEN = [
  "sentry.io",
  "sentry-cdn.com",
  "wixpress.com",
  "wix.com",
  "godaddy.com",
  "squarespace.com",
  "jimdo.com",
  "webflow.com",
  "example.com",
  "example.org",
  "example.net",
] as const;

/** Eerste label van het domein dat een voorbeeld- of plaatshouderadres verraadt (zoals de oude regex deed). */
const ROMMEL_LABELS = new Set(["sentry", "wixpress", "example", "domain", "email", "test", "godaddy"]);

/** Een bestandsnaam met een @ erin (plaatje, stylesheet, script) is geen adres. */
const BESTAND = /\.(png|jpe?g|gif|svg|webp|css|js)$/i;

/** De publieke sleutel van een Sentry-DSN: 32 hextekens vóór de @. */
const SENTRY_SLEUTEL = /^[0-9a-f]{32}$/i;

/** Geen adressen voor een kennismaking: systeem- en klachtenadressen. */
const GEEN_KENNISMAKING = /^(no-?reply|do-?not-?reply|mailer-daemon|postmaster|abuse|privacy)$/i;

/** Mag dit adres een zakelijke kennismaking krijgen: geen rommel en geen systeem-, klachten- of privacyadres. */
export function bruikbaarVoorKennismaking(email: string): boolean {
  const e = email.trim().toLowerCase();
  if (isRommelAdres(e)) return false;
  return !GEEN_KENNISMAKING.test(e.slice(0, e.indexOf("@")));
}

/** Is dit adres rommel: geen adres van het bedrijf zelf, maar van een dienst, een voorbeeld of een bestand? */
export function isRommelAdres(email: string): boolean {
  const e = email.trim().toLowerCase();
  if (BESTAND.test(e)) return true;
  const at = e.indexOf("@");
  if (at <= 0 || at !== e.lastIndexOf("@")) return true;
  const lokaal = e.slice(0, at);
  const domein = e.slice(at + 1);
  if (!domein.includes(".")) return true;
  if (SENTRY_SLEUTEL.test(lokaal)) return true;
  if (ROMMEL_LABELS.has(domein.split(".")[0] ?? "")) return true;
  return ROMMEL_DOMEINEN.some((d) => domein === d || domein.endsWith(`.${d}`));
}
