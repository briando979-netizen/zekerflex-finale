// ---------------------------------------------------------------------------
// De handleidingen (Outline) draaien nog op een kaal serveradres (kennis.<ip>.sslip.io): er is geen wildcard-DNS, de nette
// naam is een taak voor de eigenaar. Gebruikersonderzoek 22 nov 2026: werkers zagen die link op Account en vonden hem
// vreemd. Zo'n adres tonen we werkers dus niet; zodra OUTLINE_PUBLIC_URL een echte naam heeft, staat de link er vanzelf
// weer. Puur bestand.
// ---------------------------------------------------------------------------

/** Het adres van de handleidingen als het een nette naam heeft; null bij geen adres, sslip.io/nip.io of een IP-adres. */
export function netteHandleidingenUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (/\.(sslip|nip)\.io$/.test(host)) return null;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) return null;
  return url;
}
