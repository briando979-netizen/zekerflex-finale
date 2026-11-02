// ---------------------------------------------------------------------------
// Website-check: beoordeelt één opgehaalde pagina (plus robots.txt, sitemap,
// de http-versie en een handvol interne links) en zet dat om in bevindingen in
// gewone taal voor een ondernemer. Puur: geen netwerk, zodat het te testen is.
// Bewust geen volledige audit — één pagina, gemeten vanaf onze server.
// ---------------------------------------------------------------------------

export type CheckCategory = "snelheid" | "mobiel" | "google" | "veiligheid" | "bezoekers";
export type FindingStatus = "goed" | "let-op" | "probleem";

export interface Finding {
  id: string;
  category: CheckCategory;
  status: FindingStatus;
  title: string;
  detail: string;
}

export const CATEGORY_LABEL: Record<CheckCategory, string> = {
  snelheid: "Snelheid",
  mobiel: "Telefoon",
  google: "Vindbaar in Google",
  veiligheid: "Veiligheid",
  bezoekers: "Bezoekers",
};
const CATEGORY_ORDER: CheckCategory[] = ["snelheid", "mobiel", "google", "veiligheid", "bezoekers"];
const PENALTY: Record<FindingStatus, number> = { goed: 0, "let-op": 12, probleem: 35 };

export interface PageInput {
  finalUrl: string;
  status: number;
  headers: Record<string, string>;
  html: string;
  bytes: number;
  transferBytes: number;
  ttfbMs: number;
}

export interface ExtraInput {
  /** eindadres van http://<host>/ , of null als dat niet lukte */
  httpRedirectsTo: string | null;
  robotsTxt: string | null;
  sitemapFound: boolean;
  links: { url: string; status: number | null }[];
  /** host van een ándere website waar het adres naartoe stuurt (bijv. een toestemmingspagina) */
  redirectedToOtherSite?: string | null;
}

export interface PageFacts {
  title: string | null;
  description: string | null;
  lang: string | null;
  viewport: string | null;
  canonical: string | null;
  robotsMeta: string | null;
  h1Count: number;
  ogTitle: boolean;
  ogImage: boolean;
  jsonLd: boolean;
  images: number;
  imagesWithoutAlt: number;
  imagesNotLazy: number;
  scripts: number;
  blockingScripts: number;
  stylesheets: number;
  mixedContent: string[];
  hasForm: boolean;
  hasTel: boolean;
  hasMail: boolean;
  generator: string | null;
  platform: string | null;
  internalLinks: string[];
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };
function decodeEntities(s: string): string {
  return s
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+|#39);/gi, (m, e: string) => {
      const key = e.toLowerCase();
      if (ENTITIES[key] !== undefined) return ENTITIES[key];
      if (key.startsWith("#x")) return String.fromCodePoint(parseInt(key.slice(2), 16) || 32);
      if (key.startsWith("#")) return String.fromCodePoint(Number(key.slice(1)) || 32);
      return m;
    })
    .replace(/\s+/g, " ")
    .trim();
}

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  if (!m) return null;
  return decodeEntities(m[1] ?? m[2] ?? m[3] ?? "");
}

function tags(html: string, name: string): string[] {
  return html.match(new RegExp(`<${name}\\b[^>]*>`, "gi")) ?? [];
}

function metaContent(metas: string[], key: string, value: string): string | null {
  for (const m of metas) {
    if ((attr(m, key) ?? "").toLowerCase() === value) return attr(m, "content");
  }
  return null;
}

function detectPlatform(html: string, headers: Record<string, string>, generator: string | null): string | null {
  const gen = generator ?? "";
  const wp = /wordpress\s*([\d.]+)?/i.exec(gen);
  if (wp) return wp[1] ? `WordPress ${wp[1]}` : "WordPress";
  if (/wp-content\/|wp-includes\//i.test(html)) return "WordPress";
  if (headers["x-wix-request-id"] || /static\.wixstatic\.com|wix-bolt|_wixCssImports/i.test(html)) return "Wix";
  if (/cdn\.shopify\.com|Shopify\.theme/i.test(html)) return "Shopify";
  if (/squarespace\.com|static1\.squarespace/i.test(html)) return "Squarespace";
  if (/webflow\.(com|io)|data-wf-page/i.test(html)) return "Webflow";
  if (/jimdo|jimstatic/i.test(html)) return "Jimdo";
  if (/joomla/i.test(gen)) return "Joomla";
  if (/drupal/i.test(gen) || /\/sites\/default\/files\//i.test(html)) return "Drupal";
  if (/__NEXT_DATA__|\/_next\/static\//.test(html)) return "Next.js";
  if (/\/_nuxt\//.test(html)) return "Nuxt";
  if (gen) return gen.slice(0, 40);
  return null;
}

export function extractFacts(html: string, finalUrl: string, headers: Record<string, string> = {}): PageFacts {
  const base = new URL(finalUrl);
  const noScripts = html.replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ");
  const head = /<head\b[\s\S]*?<\/head>/i.exec(html)?.[0] ?? html.slice(0, 20_000);
  const metas = tags(html, "meta");
  const links = tags(html, "link");
  const scriptTags = tags(html, "script");
  const imgs = tags(noScripts, "img");

  const titleRaw = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(noScripts)?.[1];
  const title = titleRaw ? decodeEntities(titleRaw) || null : null;
  const description = metaContent(metas, "name", "description");
  const htmlTag = tags(html, "html")[0] ?? "";
  const canonicalTag = links.find((l) => (attr(l, "rel") ?? "").toLowerCase().split(/\s+/).includes("canonical"));
  const generator = metaContent(metas, "name", "generator");

  const externalScripts = scriptTags.filter((s) => attr(s, "src"));
  const headScripts = tags(head, "script").filter((s) => attr(s, "src"));
  const blockingScripts = headScripts.filter((s) => !/\s(async|defer)\b/i.test(s) && (attr(s, "type") ?? "").toLowerCase() !== "module").length;

  const mixedContent: string[] = [];
  if (base.protocol === "https:") {
    for (const t of [...externalScripts, ...imgs, ...tags(html, "iframe"), ...links.filter((l) => /stylesheet/i.test(attr(l, "rel") ?? ""))]) {
      const src = attr(t, "src") ?? attr(t, "href") ?? "";
      if (/^http:\/\//i.test(src)) mixedContent.push(src);
    }
  }

  const internal = new Set<string>();
  for (const a of tags(noScripts, "a")) {
    const href = attr(a, "href");
    if (!href || /^(#|mailto:|tel:|javascript:|data:|sms:|whatsapp:)/i.test(href)) continue;
    try {
      const u = new URL(href, base);
      if (u.host !== base.host || (u.protocol !== "http:" && u.protocol !== "https:")) continue;
      u.hash = "";
      if (u.toString() !== base.toString()) internal.add(u.toString());
    } catch {
      /* ongeldige link: overslaan */
    }
  }

  return {
    title,
    description: description?.trim() || null,
    lang: attr(htmlTag, "lang"),
    viewport: metaContent(metas, "name", "viewport"),
    canonical: canonicalTag ? attr(canonicalTag, "href") : null,
    robotsMeta: metaContent(metas, "name", "robots"),
    h1Count: tags(noScripts, "h1").length,
    ogTitle: Boolean(metaContent(metas, "property", "og:title")),
    ogImage: Boolean(metaContent(metas, "property", "og:image")),
    jsonLd: /<script[^>]+application\/ld\+json/i.test(html),
    images: imgs.length,
    imagesWithoutAlt: imgs.filter((i) => attr(i, "alt") === null).length,
    imagesNotLazy: imgs.filter((i) => (attr(i, "loading") ?? "").toLowerCase() !== "lazy").length,
    scripts: externalScripts.length,
    blockingScripts,
    stylesheets: links.filter((l) => /stylesheet/i.test(attr(l, "rel") ?? "")).length,
    mixedContent,
    hasForm: /<form\b/i.test(noScripts),
    hasTel: /href\s*=\s*["']?tel:/i.test(noScripts),
    hasMail: /href\s*=\s*["']?mailto:/i.test(noScripts),
    generator,
    platform: detectPlatform(html, headers, generator),
    internalLinks: [...internal],
  };
}

const kb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))} kB`;
const sec = (ms: number) => `${(ms / 1000).toLocaleString("nl-NL", { maximumFractionDigits: 1 })} s`;

function robotsBlocksAll(robots: string): boolean {
  // Alleen de groep voor alle crawlers (User-agent: *) telt hier.
  let inStar = false;
  for (const line of robots.split(/\r?\n/)) {
    const l = line.replace(/#.*/, "").trim();
    const ua = /^user-agent\s*:\s*(.+)$/i.exec(l);
    if (ua) {
      inStar = ua[1]!.trim() === "*";
      continue;
    }
    if (inStar && /^disallow\s*:\s*\/\s*$/i.test(l)) return true;
  }
  return false;
}

export function buildFindings(page: PageInput, facts: PageFacts, extra: ExtraInput): Finding[] {
  const f: Finding[] = [];
  const add = (id: string, category: CheckCategory, status: FindingStatus, title: string, detail: string) => f.push({ id, category, status, title, detail });
  const https = page.finalUrl.startsWith("https://");
  const h = page.headers;

  // --- snelheid
  if (page.ttfbMs < 600) add("ttfb", "snelheid", "goed", `Server reageert snel (${sec(page.ttfbMs)})`, "De eerste reactie van je server is er binnen een halve seconde.");
  else if (page.ttfbMs < 1500) add("ttfb", "snelheid", "let-op", `Server reageert wat traag (${sec(page.ttfbMs)})`, "Bezoekers wachten even voordat er iets verschijnt. Beter is onder 0,6 seconde, bijvoorbeeld met caching of snellere hosting.");
  else add("ttfb", "snelheid", "probleem", `Server reageert traag (${sec(page.ttfbMs)})`, "Na ruim een seconde haakt een deel van de bezoekers al af. Dit ligt meestal aan trage hosting of een zware website zonder caching.");

  if (page.bytes > 1_000_000) add("html-size", "snelheid", "probleem", `Zware pagina (${kb(page.bytes)} aan code)`, "De pagina zelf is groter dan 1 MB, nog zonder foto's. Op een telefoon met slecht bereik duurt dat lang.");
  else if (page.bytes > 300_000) add("html-size", "snelheid", "let-op", `Vrij zware pagina (${kb(page.bytes)} aan code)`, "Dit kan lichter. Vaak zit er onnodige code van plugins of een paginabouwer in.");
  else add("html-size", "snelheid", "goed", `Lichte pagina (${kb(page.bytes)} aan code)`, "De pagina zelf is compact.");

  const enc = (h["content-encoding"] ?? "").toLowerCase();
  if (page.bytes > 20_000) {
    if (/gzip|br|deflate/.test(enc)) add("compression", "snelheid", "goed", "Pagina wordt gecomprimeerd verstuurd", `Er gaat ${kb(page.transferBytes)} over de lijn in plaats van ${kb(page.bytes)}.`);
    else add("compression", "snelheid", "let-op", "Geen compressie", "Je server verstuurt de pagina onverpakt. Met compressie (gzip of brotli) laadt hij vaak drie keer sneller.");
  }

  if (facts.scripts > 30) add("scripts", "snelheid", "probleem", `${facts.scripts} losse scripts`, "Elk script is een extra download. Zoveel scripts maken de site traag, vooral op telefoons.");
  else if (facts.scripts > 15) add("scripts", "snelheid", "let-op", `${facts.scripts} losse scripts`, "Dat zijn er veel. Vaak kunnen plugins of trackers weg of samengevoegd worden.");
  if (facts.blockingScripts > 3) add("blocking", "snelheid", "let-op", `${facts.blockingScripts} scripts houden het laden op`, "Deze scripts staan bovenaan de pagina zonder 'defer' of 'async'. De browser wacht erop voordat hij iets laat zien.");
  if (facts.imagesNotLazy > 10) add("lazy", "snelheid", "let-op", `${facts.imagesNotLazy} afbeeldingen laden allemaal meteen`, "Afbeeldingen onderaan de pagina kunnen pas laden als iemand ernaartoe scrolt (lazy loading).");

  // --- mobiel
  if (!facts.viewport) add("viewport", "mobiel", "probleem", "Niet ingericht voor telefoons", "De pagina mist de instelling die telefoons vertelt hoe breed het scherm is. Op een telefoon zie je dan een verkleinde computerversie.");
  else if (/width\s*=\s*device-width/i.test(facts.viewport)) add("viewport", "mobiel", "goed", "Ingericht voor telefoons", "De pagina past zich aan de schermbreedte aan.");
  else add("viewport", "mobiel", "let-op", "Telefoon-instelling klopt niet helemaal", "De schermbreedte-instelling gebruikt geen 'device-width'. Op sommige telefoons valt de pagina dan verkeerd.");
  if (facts.viewport && /user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0)?\b/i.test(facts.viewport)) {
    add("zoom", "mobiel", "let-op", "Inzoomen is geblokkeerd", "Bezoekers met slechte ogen kunnen niet inzoomen. Dat is ook een toegankelijkheidseis.");
  }

  // --- google
  if (!facts.title) add("title", "google", "probleem", "Geen paginatitel", "De titel is wat Google als blauwe kop in de zoekresultaten laat zien. Zonder titel verzint Google er zelf een.");
  else if (facts.title.length < 10 || facts.title.length > 65) add("title", "google", "let-op", `Paginatitel is ${facts.title.length < 10 ? "erg kort" : "te lang"} (${facts.title.length} tekens)`, `"${facts.title.slice(0, 80)}". Tussen 10 en 65 tekens wordt hij volledig getoond.`);
  else add("title", "google", "goed", "Goede paginatitel", `"${facts.title}"`);

  if (!facts.description) add("description", "google", "let-op", "Geen omschrijving voor Google", "De omschrijving is het grijze tekstje onder je titel in Google. Zonder pakt Google een willekeurig stuk tekst.");
  else if (facts.description.length < 50 || facts.description.length > 170) add("description", "google", "let-op", `Omschrijving is ${facts.description.length < 50 ? "erg kort" : "te lang"} (${facts.description.length} tekens)`, "Tussen 50 en 160 tekens werkt het best.");
  else add("description", "google", "goed", "Goede omschrijving voor Google", facts.description);

  if (facts.h1Count === 0) add("h1", "google", "let-op", "Geen hoofdkop", "Een duidelijke hoofdkop (h1) vertelt Google waar de pagina over gaat.");
  else if (facts.h1Count > 1) add("h1", "google", "let-op", `${facts.h1Count} hoofdkoppen`, "Eén hoofdkop per pagina is duidelijker voor Google.");
  else add("h1", "google", "goed", "Eén duidelijke hoofdkop", "Google ziet direct waar de pagina over gaat.");

  const noindex = /noindex/i.test(facts.robotsMeta ?? "") || /noindex/i.test(h["x-robots-tag"] ?? "");
  if (noindex) add("noindex", "google", "probleem", "Google mag deze pagina niet tonen", "De pagina staat op 'noindex'. Dat staat vaak nog aan van toen de site gebouwd werd. Zo vind je hem niet in Google.");

  if (extra.robotsTxt !== null && robotsBlocksAll(extra.robotsTxt)) add("robots", "google", "probleem", "robots.txt blokkeert alle zoekmachines", "In robots.txt staat 'Disallow: /' voor iedereen. Zoekmachines mogen dan niets van je site lezen.");
  else if (extra.robotsTxt === null) add("robots", "google", "let-op", "Geen robots.txt", "Dit kleine bestand helpt zoekmachines je site goed te lezen en wijst naar je sitemap.");
  if (extra.sitemapFound) add("sitemap", "google", "goed", "Sitemap gevonden", "Google kan zo al je pagina's vinden.");
  else add("sitemap", "google", "let-op", "Geen sitemap gevonden", "Een sitemap is een lijst van al je pagina's voor Google. Zonder sitemap worden nieuwe pagina's later gevonden.");

  if (!facts.lang) add("lang", "google", "let-op", "Taal van de pagina niet aangegeven", "Zet de taal (nl) in de pagina, dan weet Google voor wie hij bedoeld is en lezen voorleesprogramma's goed voor.");
  if (!facts.ogTitle || !facts.ogImage) add("og", "google", "let-op", "Geen nette preview bij delen", "Als iemand je link deelt in WhatsApp of LinkedIn verschijnt er geen titel met afbeelding.");
  if (!facts.jsonLd) add("jsonld", "google", "let-op", "Geen bedrijfsgegevens voor Google", "Met gestructureerde gegevens (adres, openingstijden, reviews) kan Google rijkere zoekresultaten tonen.");
  if (facts.imagesWithoutAlt > 0) add("alt", "google", "let-op", `${facts.imagesWithoutAlt} van ${facts.images} afbeeldingen zonder omschrijving`, "Een korte omschrijving (alt-tekst) helpt Google Afbeeldingen en blinde bezoekers.");

  // --- veiligheid
  if (https) add("https", "veiligheid", "goed", "Beveiligde verbinding (https)", "Het slotje staat in de adresbalk.");
  else add("https", "veiligheid", "probleem", "Geen beveiligde verbinding", "Browsers zetten 'Niet veilig' naast je adres en Google zet je lager. Een gratis certificaat lost dit op.");
  if (extra.httpRedirectsTo !== null) {
    if (extra.httpRedirectsTo.startsWith("https://")) add("http-redirect", "veiligheid", "goed", "http stuurt door naar https", "Wie het adres zonder https intypt, komt toch op de beveiligde versie.");
    else if (https) add("http-redirect", "veiligheid", "let-op", "http stuurt niet door naar https", "Wie het adres zonder https intypt, blijft op de onbeveiligde versie.");
  }
  if (https && !h["strict-transport-security"]) add("hsts", "veiligheid", "let-op", "Browser wordt niet gedwongen https te gebruiken", "Met de HSTS-instelling onthoudt de browser dat je site alleen beveiligd geopend mag worden.");
  if (!h["x-content-type-options"] && !h["content-security-policy"]) add("headers", "veiligheid", "let-op", "Beveiligingsinstellingen van de server ontbreken", "Instellingen als Content-Security-Policy en X-Content-Type-Options maken aanvallen via je site lastiger.");
  if (facts.mixedContent.length > 0) add("mixed", "veiligheid", "probleem", `${facts.mixedContent.length} onveilige onderdelen op een beveiligde pagina`, "Sommige scripts of afbeeldingen worden via http geladen. Browsers blokkeren die of tonen een waarschuwing.");

  const powered = `${h["x-powered-by"] ?? ""} ${h.server ?? ""}`;
  const php = /PHP\/(\d+)\.(\d+)/i.exec(powered);
  if (php && (Number(php[1]) < 8 || (Number(php[1]) === 8 && Number(php[2]) < 2))) {
    add("php", "veiligheid", "probleem", `Verouderde PHP-versie (${php[1]}.${php[2]})`, "Deze versie krijgt geen beveiligingsupdates meer. Een lek wordt niet meer gedicht.");
  } else if (/\/\d/.test(powered)) {
    add("version-leak", "veiligheid", "let-op", "Server vertelt welke software hij draait", `De server noemt zijn versie (${powered.trim().slice(0, 60)}). Dat helpt aanvallers bij het zoeken naar lekken.`);
  }
  const wp = /^WordPress (\d+)\./.exec(facts.platform ?? "");
  if (wp && Number(wp[1]) < 6) add("wp-old", "veiligheid", "probleem", `Verouderde WordPress (${facts.platform})`, "Oude WordPress-versies zijn een bekend doelwit van hackers. Bijwerken is dringend.");
  else if (facts.generator && /wordpress\s*\d/i.test(facts.generator)) add("wp-version", "veiligheid", "let-op", "WordPress-versie is zichtbaar", "Je site vertelt welke WordPress-versie hij draait. Dat maakt gericht zoeken naar lekken makkelijker.");

  // --- bezoekers
  if (extra.redirectedToOtherSite) {
    add("other-site", "bezoekers", "let-op", `Je adres stuurt door naar ${extra.redirectedToOtherSite}`, "We kwamen uit op een andere website. Is dat een cookie- of toestemmingspagina, dan ziet Google ook eerst die pagina. Klopt het niet, dan meten we hier de verkeerde pagina.");
  }
  if (facts.hasTel || facts.hasMail || facts.hasForm) {
    const ways = [facts.hasTel && "telefoon", facts.hasMail && "e-mail", facts.hasForm && "formulier"].filter(Boolean).join(", ");
    add("contact", "bezoekers", "goed", "Bezoekers kunnen je direct bereiken", `Op de pagina staat: ${ways}.`);
  } else {
    add("contact", "bezoekers", "let-op", "Geen directe contactmogelijkheid", "Er staat geen klikbaar telefoonnummer, e-mailadres of formulier op deze pagina. Elke extra klik kost klanten.");
  }
  const checked = extra.links.length;
  const broken = extra.links.filter((l) => l.status === null || l.status >= 400);
  if (checked > 0) {
    if (broken.length === 0) add("links", "bezoekers", "goed", `${checked} links gecontroleerd, alles werkt`, "Geen kapotte links gevonden op deze pagina.");
    else {
      const list = broken.slice(0, 5).map((l) => new URL(l.url).pathname + (l.status ? ` (${l.status})` : " (geen antwoord)")).join(", ");
      add("links", "bezoekers", "probleem", `${broken.length} van ${checked} links werken niet`, `Bezoekers die hierop klikken krijgen een foutpagina: ${list}.`);
    }
  }

  return f;
}

export function scoreFindings(findings: Finding[]): { score: number; categories: { id: CheckCategory; label: string; score: number }[] } {
  const categories = CATEGORY_ORDER.map((id) => {
    const penalty = findings.filter((x) => x.category === id).reduce((sum, x) => sum + PENALTY[x.status], 0);
    return { id, label: CATEGORY_LABEL[id], score: Math.max(0, 100 - penalty) };
  });
  const score = Math.round(categories.reduce((s, c) => s + c.score, 0) / categories.length);
  return { score, categories };
}
