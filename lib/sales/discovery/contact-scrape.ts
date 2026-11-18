import { fetchPage as veiligOphalen } from "@/lib/website-check/fetch";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { guessAndVerifyDomain } from "@/lib/sales/discovery/domain-guess";
import { lookupCompanyContact } from "@/lib/sales/discovery/places-lookup";
import { bruikbaarVoorKennismaking } from "@/lib/sales/discovery/rommel-adres";
import { FREE_MAIL_DOMAINS } from "@/lib/sales/vrije-maildomeinen";
import { loadRobots, robotsAllows } from "@/lib/sales/discovery/robots";

function safeOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}
function safeHost(origin: string): string | null {
  try {
    return new URL(origin).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Contactgegevens-verrijker. KVKBase-leads zijn kale stubs (naam + KVK, geen
// telefoon/mail). Deze haalt via het bedrijfsdomein (uit sourceUrl of geraden
// via guessAndVerifyDomain) de homepage + een paar contactpagina's op en haalt
// er een TELEFOONNUMMER en een e-mailadres uit. Alleen publieke HTML, met
// respect voor robots.txt en Crawl-delay (robots.ts, net als de careers-crawler).
//
// Een adres telt alleen op het eigen domein van de site (of het domein waar
// dezelfde site naar doorverwijst): nooit het adres van de webbouwer, een keten
// of een platform. Niets geraden, geen info@-gok. Een bestaand telefoonnummer
// blijft staan. Elke poging komt in enrichmentJson.contactScrape, zodat de motor
// dezelfde leads niet elke dag opnieuw pakt (14 nov 2026: 37 stubs zonder
// website stonden zo vooraan dat de leads mét website nooit aan de beurt kwamen).
// ---------------------------------------------------------------------------

const UA = "ZekerFlexBot/1.0 (+https://zekerflex.com/bot; zakelijke kennismaking)";
const TIMEOUT_MS = 10_000;
const MAX_BYTES = 1_200_000;
const CONTACT_PATHS = ["/", "/contact", "/contact/", "/contact-us", "/over-ons", "/nl/contact", "/contactgegevens"];
/** Alleen als de paden hierboven geen adres gaven (18 nov 2026): daar staat het adres vaak wél. */
const EXTRA_PATHS = ["/colofon", "/impressum", "/over", "/neem-contact-op", "/privacy"];
/** Hooguit zoveel verzoeken per site in één poging, robots.txt meegeteld. */
export const MAX_VERZOEKEN = 10;
/** Bij meerdere eigen adressen: eerst personeel, dan het algemene adres; anders het eerste dat er staat. */
const VOORKEUR: readonly (readonly string[])[] = [
  ["personeel", "personeelszaken", "hr", "recruitment", "werving", "vacatures", "jobs"],
  ["info", "contact"],
];
/** Platforms waar een site op een subdomein staat: hun eigen adres is nooit dat van het bedrijf. */
const PLATFORMS = ["wordpress.com", "wixsite.com", "webflow.io", "jimdosite.com", "jimdofree.com", "squarespace.com", "github.io", "netlify.app", "vercel.app", "blogspot.com", "myshopify.com", "weebly.com"];
/** Na zoveel dagen probeert de motor een lead opnieuw (zelfde patroon als het domein raden in engine.ts). */
export const CONTACT_RETRY_DAYS = 14;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Pagina {
  html: string;
  finalUrl: string;
}

async function fetchPage(url: string): Promise<Pagina | null> {
  try {
    // via de beveiligde fetcher: nooit naar het eigen netwerk (ook niet via een redirect), begrensd in tijd en grootte
    const res = await veiligOphalen(url, { timeoutMs: TIMEOUT_MS, maxBytes: MAX_BYTES, userAgent: UA });
    const ct = (res.headers["content-type"] ?? "").toLowerCase();
    if (res.status < 200 || res.status >= 300 || !/text\/html|xhtml/.test(ct)) return null;
    return { html: res.body.slice(0, MAX_BYTES), finalUrl: res.finalUrl || url };
  } catch {
    return null;
  }
}

/** Normaliseer een ruw gevonden nummer; null als het geen plausibel NL/intl nummer is. */
function cleanPhone(raw: string): string | null {
  let n = raw.replace(/[^\d+]/g, "");
  if (n.startsWith("00")) n = `+${n.slice(2)}`;
  const digits = n.replace(/\D/g, "");
  if (digits.length < 9 || digits.length > 13) return null;
  // Weiger KVK-achtige 8-cijferige reeksen en jaartallen: NL vast/mobiel = 10 cijfers (0..) of +31 + 9.
  if (!n.startsWith("+") && !n.startsWith("0")) return null;
  return n;
}

function extractPhone(html: string): string | null {
  for (const m of html.matchAll(/tel:([+0-9()\s.\-]{7,20})/gi)) {
    const p = cleanPhone(m[1] ?? "");
    if (p) return p;
  }
  for (const m of html.matchAll(/(?:\+31|0031|0)[\s.\-]?\d(?:[\s.\-]?\d){7,9}/g)) {
    const p = cleanPhone(m[0] ?? "");
    if (p) return p;
  }
  return null;
}

/** Hoort het domein van een adres bij de site? Hetzelfde domein, een subdomein ervan, of het hoofddomein van een site op een subdomein (shop.acme.nl → acme.nl), maar nooit een platform. */
export function zelfdeDomein(adresDomein: string, siteHost: string): boolean {
  const a = adresDomein.toLowerCase().replace(/^www\./, "");
  const s = siteHost.toLowerCase().replace(/^www\./, "");
  if (!a.includes(".") || !s.includes(".")) return false;
  if (a === s || a.endsWith(`.${s}`)) return true;
  return s.endsWith(`.${a}`) && !PLATFORMS.includes(a);
}

/**
 * Maakt een verstopt adres weer leesbaar vóór het zoeken: "&#64;" en "&#x40;" (de @ als HTML-teken), "info [at] acme.nl",
 * "info (at) acme [punt] nl". Verandert verder niets; of het adres meetelt, bepaalt kiesAdres (eigen domein, geen rommel).
 */
export function ontcijferAdressen(html: string): string {
  return html
    .replace(/&#0*64;|&#x0*40;|&commat;/gi, "@")
    .replace(/&#0*46;|&#x0*2e;|&period;/gi, ".")
    // begrensde witruimte: een pagina met lange rijen spaties mag het zoeken niet traag maken
    .replace(/[ \t]{0,3}(?:\[\s{0,3}at\s{0,3}\]|\(\s{0,3}at\s{0,3}\))[ \t]{0,3}/gi, "@")
    .replace(/[ \t]{0,3}(?:\[\s{0,3}(?:punt|dot)\s{0,3}\]|\(\s{0,3}(?:punt|dot)\s{0,3}\))[ \t]{0,3}/gi, ".");
}

/**
 * Het adres om mee kennis te maken, uit de pagina's van één site. Eerst een adres op het eigen domein. Staat dat er niet,
 * dan een adres bij een gratis maildienst (gmail, ziggo, …) waar de site zelf met een mailto-link naar wijst: veel kleine
 * bedrijven hebben geen adres op hun eigen domein. Los in de tekst telt zo'n adres niet. Anders null.
 */
export function kiesAdres(paginas: readonly string[], eigenHosts: readonly string[]): string | null {
  const gevonden: string[] = [];
  const mailtos: string[] = [];
  for (const ruw of paginas) {
    const html = ontcijferAdressen(ruw);
    for (const m of html.matchAll(/mailto:([^"'?>\s]+)/gi)) {
      const adres = (m[1] ?? "").replace(/%40/g, "@").toLowerCase();
      gevonden.push(adres);
      mailtos.push(adres);
    }
    for (const m of html.matchAll(/\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi)) gevonden.push((m[0] ?? "").toLowerCase());
  }
  const bruikbaar = (e: string): boolean => {
    const [lokaal = "", domein = ""] = e.split("@");
    return Boolean(lokaal && domein) && bruikbaarVoorKennismaking(e);
  };
  const eigen = [...new Set(gevonden)].filter((e) => bruikbaar(e) && eigenHosts.some((h) => zelfdeDomein(e.split("@")[1] ?? "", h)));
  for (const groep of VOORKEUR) {
    const raak = eigen.find((e) => groep.includes(e.split("@")[0] ?? ""));
    if (raak) return raak;
  }
  if (eigen[0]) return eigen[0];
  return [...new Set(mailtos)].find((e) => bruikbaar(e) && FREE_MAIL_DOMAINS.has(e.split("@")[1] ?? "")) ?? null;
}

export type ContactUitkomst = "adres" | "geen-adres" | "robots" | "onbereikbaar" | "geen-site";

/** De leads die deze run aan de beurt zijn: nooit geprobeerd eerst (met een website vóór zonder), dan de oudste poging; een poging van minder dan CONTACT_RETRY_DAYS geleden wacht. */
export function contactBeurt(
  rijen: readonly { id: string; createdAt: Date; sourceUrl: string | null; enrichmentJson: unknown }[],
  nu: Date,
  aantal: number,
): string[] {
  const grens = nu.getTime() - CONTACT_RETRY_DAYS * 24 * 60 * 60 * 1000;
  const poging = (json: unknown): number | null => {
    if (!json || typeof json !== "object" || Array.isArray(json)) return null;
    const at = (json as { contactScrape?: { at?: unknown } }).contactScrape?.at;
    const t = typeof at === "string" ? Date.parse(at) : NaN;
    return Number.isFinite(t) ? t : null;
  };
  return rijen
    .map((r) => ({ id: r.id, t: poging(r.enrichmentJson), site: r.sourceUrl ? 0 : 1, c: r.createdAt.getTime() }))
    .filter((r) => r.t === null || r.t <= grens)
    .sort((a, b) => {
      if ((a.t === null) !== (b.t === null)) return a.t === null ? -1 : 1;
      if (a.t !== null && b.t !== null && a.t !== b.t) return a.t - b.t;
      return a.site - b.site || a.c - b.c;
    })
    .slice(0, aantal)
    .map((r) => r.id);
}

interface SiteUitslag {
  email: string | null;
  phone: string | null;
  uitkomst: ContactUitkomst;
  opgehaald: number;
  verboden: number;
}

/** De homepage en een paar contactpagina's van één site, met robots.txt en Crawl-delay; een doorverwijzing van de homepage naar een ander domein volgen we daar verder. */
async function zoekOpSite(start: string, zoekTelefoon: boolean): Promise<SiteUitslag> {
  let origin = start;
  let robots = await loadRobots(origin);
  const eigenHosts = new Set<string>([safeHost(start) ?? ""].filter(Boolean));
  const paginas: string[] = [];
  let phone: string | null = null;
  let opgehaald = 0;
  let verboden = 0;
  // robots.txt hierboven telt mee; samen met de pagina's nooit meer dan MAX_VERZOEKEN per site
  let verzoeken = 1;
  /** Eén rij paden aflopen; geeft true terug zodra er een personeelsadres staat (dan hoeft de rest niet meer). */
  const loop = async (paden: readonly string[]): Promise<boolean> => {
    for (const pad of paden) {
      if (verzoeken >= MAX_VERZOEKEN) return false;
      if (!robotsAllows(robots, pad)) {
        verboden += 1;
        continue;
      }
      if (opgehaald > 0 && robots.crawlDelayMs) await sleep(robots.crawlDelayMs);
      opgehaald += 1;
      verzoeken += 1;
      const pagina = await fetchPage(origin + pad);
      if (!pagina) continue;
      const doel = safeOrigin(pagina.finalUrl);
      if (doel && doel !== origin) {
        // een contactpagina die naar een ander domein stuurt (een formulierdienst, een platform) telt niet mee
        if (pad !== "/") continue;
        // de homepage stuurt door (https, www, een nieuwe naam, een hoofdsite): dat domein telt als eigen, met zijn eigen
        // robots.txt, en de contactpagina's zoeken we daar
        verzoeken += 1;
        const doelRobots = await loadRobots(doel);
        if (!robotsAllows(doelRobots, new URL(pagina.finalUrl).pathname)) {
          verboden += 1;
          continue;
        }
        const host = safeHost(doel);
        if (host) eigenHosts.add(host);
        origin = doel;
        robots = doelRobots;
      }
      paginas.push(pagina.html);
      if (zoekTelefoon) phone = phone ?? extractPhone(pagina.html);
      // een personeelsadres is het beste wat er staat: dan hoeft de rest niet meer
      const adres = kiesAdres(paginas, [...eigenHosts]);
      if (adres && (VOORKEUR[0] ?? []).includes(adres.split("@")[0] ?? "") && (phone || !zoekTelefoon)) return true;
    }
    return false;
  };
  const klaar = await loop(CONTACT_PATHS);
  // de site gaf pagina's maar geen adres: nog een paar plekken waar het vaak staat (colofon, impressum, privacyverklaring)
  if (!klaar && paginas.length > 0 && !kiesAdres(paginas, [...eigenHosts])) await loop(EXTRA_PATHS);
  const email = kiesAdres(paginas, [...eigenHosts]);
  // niets gelezen: verbood robots.txt het (ook dat van het doeldomein), dan "robots"; anders gaf de site geen pagina
  const uitkomst: ContactUitkomst = !paginas.length ? (verboden > 0 ? "robots" : "onbereikbaar") : email ? "adres" : "geen-adres";
  return { email, phone, uitkomst, opgehaald, verboden };
}

export interface ContactScrapeResult {
  origin: string | null;
  phone: string | null;
  email: string | null;
  updated: boolean;
  uitkomst: ContactUitkomst;
}

/** Zoek telefoon + e-mail voor één lead en vul de ontbrekende velden aan.
 *  Bron-volgorde: bedrijf opzoeken (Google Places of onze eigen
 *  OpenStreetMap-bron: echt nummer + website) → domein raden → website
 *  afzoeken op (nog ontbrekende) telefoon + e-mail. */
export async function enrichLeadContact(leadId: string, nu: Date = new Date()): Promise<ContactScrapeResult> {
  const lead = await prisma.salesLead.findUnique({ where: { id: leadId } });
  if (!lead) return { origin: null, phone: null, email: null, updated: false, uitkomst: "geen-site" };

  // een bestaand nummer blijft staan; dan zoeken we alleen nog een adres
  let phone: string | null = lead.contactPhone ?? null;
  let origin: string | null = lead.sourceUrl ? safeOrigin(lead.sourceUrl) : null;

  // 1. Bedrijf opzoeken: echt telefoonnummer + website (beste bron). Google als
  //    zijn sleutel er is, anders onze eigen OpenStreetMap-bron — die is gratis,
  //    dus dit staat nooit meer uit. Niet nodig als we beide al hebben.
  // het adres dat het bedrijf zelf op de kaart zette (OpenStreetMap): alleen als de site er geen geeft
  let kaartAdres: string | null = null;
  if (!phone || !origin) {
    const p = await lookupCompanyContact(lead.companyName, lead.city).catch(() => null);
    if (p?.phone && !phone) phone = p.phone;
    if (p?.website && !origin) origin = safeOrigin(p.website);
    if (p?.email && bruikbaarVoorKennismaking(p.email)) kaartAdres = p.email.trim().toLowerCase();
  }

  // 2. Nog geen website? Raad het domein.
  if (!origin) {
    const guess = await guessAndVerifyDomain(lead.companyName).catch(() => null);
    origin = guess?.origin ?? null;
  }

  // 3. Website afzoeken op ontbrekende telefoon + e-mail.
  const site = origin ? await zoekOpSite(origin, !phone) : null;
  phone = phone ?? site?.phone ?? null;
  const email = site?.email ?? kaartAdres;
  const uitkomst: ContactUitkomst = email ? "adres" : (site?.uitkomst ?? "geen-site");

  const enrichment =
    lead.enrichmentJson && typeof lead.enrichmentJson === "object" && !Array.isArray(lead.enrichmentJson) ? lead.enrichmentJson : {};
  const contactVelden: Prisma.SalesLeadUpdateInput = {
    ...(phone && !lead.contactPhone ? { contactPhone: phone } : {}),
    ...(email && !lead.discoveredEmail ? { discoveredEmail: email } : {}),
    ...(email && !lead.contactEmail ? { contactEmail: email } : {}),
    ...(origin && !lead.sourceUrl ? { sourceUrl: origin } : {}),
  };
  const updated = Object.keys(contactVelden).length > 0;
  await prisma.salesLead.update({
    where: { id: leadId },
    data: {
      ...contactVelden,
      enrichmentJson: { ...enrichment, contactScrape: { at: nu.toISOString(), uitkomst } } as Prisma.InputJsonValue,
    },
  });
  // alleen aantallen en ja/nee in het log: geen bedrijf, site of adres
  logger.info("contact scrape", {
    uitkomst,
    paginas: site?.opgehaald ?? 0,
    verboden: site?.verboden ?? 0,
    telefoon: Boolean(phone),
    adres: Boolean(email),
    bijgewerkt: updated,
  });
  return { origin, phone, email, updated, uitkomst };
}
