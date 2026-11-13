// ---------------------------------------------------------------------------
// Linkvoorbeelden in de chat, zoals WhatsApp (13 nov 2026). Puur: welke link een voorbeeld krijgt en wat we uit de
// pagina halen. Het ophalen zelf gaat via lib/website-check/fetch.ts (SSRF-wacht in de verbinding, ook bij redirects).
//
// Bewust zonder afbeelding: een plaatje van een andere site zou het IP-adres van elke lezer aan die site geven.
// Links die naar iets eenmaligs of geheims ruiken (inloggen, wachtwoord, token, afmelden, uitnodiging) halen we niet op:
// een voorbeeld zou zo'n eenmalige link kunnen opgebruiken.
// ---------------------------------------------------------------------------

export interface LinkVoorbeeld {
  url: string;
  host: string;
  titel: string;
  omschrijving?: string;
}

const URL_IN_TEKST = /\b(?:https?:\/\/|www\.)[^\s<>"']+/i;
const GEHEIM =
  /(token|apikey|api_key|access_key|secret|code=|login|logon|signin|sign-in|inloggen|auth|oauth|magic|otp|reset|verify|verif|confirm|bevestig|activate|activeer|unsubscribe|afmelden|uitschrijven|invite|uitnodig|\/join\/|password|wachtwoord|session|sig=|signature)/i;

/** De eerste link in een bericht die een voorbeeld mag krijgen, of null. */
export function voorbeeldLink(tekst: string): string | null {
  const m = URL_IN_TEKST.exec(tekst);
  if (!m) return null;
  const ruw = m[0].replace(/[.,!?;:)\]}'"]+$/, "");
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(ruw) ? ruw : `https://${ruw}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  if (GEHEIM.test(url.pathname + url.search)) return null;
  // een lange, willekeurige waarde in de querystring is waarschijnlijk een sleutel
  for (const v of url.searchParams.values()) if (/^[A-Za-z0-9_\-.]{24,}$/.test(v)) return null;
  url.hash = "";
  return url.toString();
}

function ontsnap(s: string): string {
  return s
    .replace(/&#x([0-9a-f]{1,6});/gi, (_, h: string) => safeChar(parseInt(h, 16)))
    .replace(/&#(\d{1,7});/g, (_, d: string) => safeChar(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}
const safeChar = (n: number) => (Number.isInteger(n) && n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : "");

const schoon = (s: string | undefined, max: number) => {
  const t = ontsnap(s ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
};

/** De inhoud van een <meta>-tag op property of name, in welke volgorde de attributen ook staan. */
function meta(html: string, naam: string): string | undefined {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const wie = /\b(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (wie?.toLowerCase() !== naam) continue;
    const inhoud = /\bcontent\s*=\s*"([^"]*)"/i.exec(tag)?.[1] ?? /\bcontent\s*=\s*'([^']*)'/i.exec(tag)?.[1];
    if (inhoud) return inhoud;
  }
  return undefined;
}

/** Titel, omschrijving en site uit een HTML-pagina; null als er geen titel is. */
export function leesVoorbeeld(html: string, url: string): LinkVoorbeeld | null {
  const kop = html.slice(0, 200_000); // de <head> staat vooraan
  const titel = schoon(meta(kop, "og:title") ?? meta(kop, "twitter:title") ?? /<title[^>]*>([\s\S]*?)<\/title>/i.exec(kop)?.[1], 120);
  if (!titel) return null;
  const omschrijving = schoon(meta(kop, "og:description") ?? meta(kop, "description") ?? meta(kop, "twitter:description"), 200);
  let host: string;
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
  const site = schoon(meta(kop, "og:site_name"), 60);
  return { url, host: site || host, titel, ...(omschrijving ? { omschrijving } : {}) };
}
