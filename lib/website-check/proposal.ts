import type { Finding, FindingStatus } from "@/lib/website-check/analyze";

// ---------------------------------------------------------------------------
// Uitgebreide beoordeling voor een websitevoorstel (sales, lib/sales): bovenop
// de gratis website-check (analyze.ts, die blijft zoals hij is) ook vertrouwen,
// uitstraling en contactmogelijkheden, de bedrijfsgegevens die we nodig hebben
// om een nieuwe site te bouwen, en per probleem wat ZekerFlex beter doet.
// Puur: alleen de HTML van één openbare pagina, geen netwerk.
// ---------------------------------------------------------------------------

export type ExtraCategory = "vertrouwen" | "uitstraling" | "contact";

export const EXTRA_LABEL: Record<ExtraCategory, string> = {
  vertrouwen: "Vertrouwen",
  uitstraling: "Uitstraling",
  contact: "Contact & boeken",
};

export interface BusinessFacts {
  naam: string | null;
  telefoon: string | null;
  email: string | null;
  straat: string | null;
  postcode: string | null;
  plaats: string | null;
  kvk: string | null;
  socials: string[];
  /** absolute addresses, for importing into our own storage later */
  logo: string | null;
  fotos: string[];
  /** h2/h3 headings: what the company offers, as a starting point for the new pages */
  koppen: string[];
  /** the same headings with the text under them, in the company's own words */
  secties: { kop: string; tekst: string }[];
  /** the first real paragraph of the page (their own words), for "about us" */
  intro: string | null;
  /** the phone number is a Dutch mobile number, so it can carry a WhatsApp button */
  mobiel: boolean;
  /** brand colour from <meta name="theme-color">, if any */
  kleur: string | null;
  /** latest year in the copyright line */
  jaar: number | null;
  whatsapp: boolean;
  openingstijden: boolean;
  reviews: boolean;
  privacy: boolean;
  boeken: boolean;
  favicon: boolean;
  verouderd: string[];
}

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };
const entities = (s: string) =>
  s.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+|#39);/gi, (m, e: string) => {
    const k = e.toLowerCase();
    if (ENT[k] !== undefined) return ENT[k];
    if (k.startsWith("#x")) return String.fromCodePoint(parseInt(k.slice(2), 16) || 32);
    if (k.startsWith("#")) return String.fromCodePoint(Number(k.slice(1)) || 32);
    return m;
  });
const decode = (s: string) => entities(s).replace(/\s+/g, " ").trim();
/** Like decode, but keeps line breaks: an address must not run into the next line. */
const decodeLines = (s: string) => entities(s).replace(/[^\S\n]+/g, " ").replace(/ *\n[\s]*/g, "\n").trim();
const attr = (tag: string, name: string) => {
  const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return m ? decode(m[1] ?? m[2] ?? m[3] ?? "") : null;
};
const tagsOf = (html: string, name: string) => html.match(new RegExp(`<${name}\\b[^>]*>`, "gi")) ?? [];
const abs = (src: string, base: URL) => {
  try {
    const u = new URL(src, base);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
};

const GENERIC = /^(home|homepage|welkom|start|index|hoofdpagina)$/i;
const SKIP_HEADING =
  /^(contact|menu|navigatie|zoeken|volg ons|nieuwsbrief|social|delen|cookies?|privacy|footer|meer|lees meer|copyright|openingstijden|openingsuren|adres|route|over ons|wie zijn wij|nieuws|blog|vacatures|werken bij|reviews|beoordelingen|klantervaringen|disclaimer|algemene voorwaarden|snel naar)\b/i;

/** A line from the footer (copyright, registration numbers, an address), not about a service. */
const footerLine = (t: string) => /©|copyright|alle rechten|kvk|btw-?(nummer|nr|id)|privacyverklaring|cookies?\b/i.test(t) || /\b[1-9]\d{3} ?[A-Z]{2}\b/.test(t);

/** At most `max` characters, cut after a whole sentence where possible. */
export function clipSentences(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  if (end > max * 0.4) return cut.slice(0, end + 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 1)).replace(/[,;:\s]+$/, "")}…`;
}

export function extractBusiness(html: string, finalUrl: string): BusinessFacts {
  const base = new URL(finalUrl);
  const visible = html.replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ");
  const text = decodeLines(visible.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|h\d|td|tr|address|span)>/gi, "\n").replace(/<[^>]+>/g, " "));
  const metas = tagsOf(html, "meta");
  const meta = (k: string, v: string) => metas.find((m) => (attr(m, k) ?? "").toLowerCase() === v);
  const anchors = tagsOf(visible, "a");
  const hrefs = anchors.map((a) => attr(a, "href") ?? "");

  // street (optional, may be on the line before), postcode, and a town on the same line as the postcode
  const addr = /([A-Z][\p{L}.'-]+(?: [\p{L}.'-]+){0,3} \d{1,5} ?[a-zA-Z]?)?[,\s]*\b([1-9]\d{3}) ?([A-Z]{2})\b[, ]+([A-Z][\p{L}'-]+(?:[ -][A-Z][\p{L}'-]+)?)/u.exec(text);

  // name: og:site_name, else the holder in the copyright line, else a title part that isn't the town
  const siteName = meta("property", "og:site_name");
  const holder = /(?:©|copyright)\s*(?:(?:19|20)\d{2}(?:\s*[-–]\s*(?:19|20)\d{2})?)?\s*[-–,.]?\s*([A-Z][^\n|•·]{2,58})/i.exec(text)?.[1]?.trim();
  const title = decode(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(visible)?.[1] ?? "");
  const parts = title
    .split(/\s+[|\-–—·:]\s+/)
    .map((p) => p.trim())
    .filter((p) => p && !GENERIC.test(p) && p !== addr?.[4]);
  const naam =
    (siteName ? attr(siteName, "content") : null) || (holder && !/rechten|reserved|voorbehouden/i.test(holder) ? holder.replace(/[.\s]+$/, "") : null) || parts.sort((a, b) => a.length - b.length)[0] || null;

  const tel = hrefs.find((h) => /^tel:/i.test(h))?.slice(4).replace(/[^\d+]/g, "") || /(?:\+31|0)[1-9](?:[\s-]?\d){8}/.exec(text)?.[0].replace(/[\s-]/g, "") || null;
  const email = hrefs.find((h) => /^mailto:/i.test(h))?.slice(7).split("?")[0]?.trim() || null;
  const kvk = /k\.?v\.?k[^0-9]{0,20}(\d{8})\b/i.exec(text)?.[1] ?? null;

  const socials = [...new Set(hrefs.map((h) => abs(h, base)).filter((u): u is string => Boolean(u) && /(facebook|instagram|linkedin|tiktok|youtube|twitter|x)\.com\//i.test(u!)))].slice(0, 6);

  const imgs = tagsOf(visible, "img");
  const logoTag = imgs.find((i) => /logo/i.test(`${attr(i, "src") ?? ""} ${attr(i, "alt") ?? ""} ${attr(i, "class") ?? ""} ${attr(i, "id") ?? ""}`));
  const logo = logoTag ? abs(attr(logoTag, "src") ?? "", base) : null;
  const ogImage = meta("property", "og:image");
  const fotos = [
    ...(ogImage ? [abs(attr(ogImage, "content") ?? "", base)] : []),
    ...imgs
      .filter((i) => i !== logoTag && !/logo|icon|sprite|pixel|spacer|avatar|flag/i.test(attr(i, "src") ?? ""))
      .filter((i) => /\.(jpe?g|png|webp)(\?|$)/i.test(attr(i, "src") ?? ""))
      .filter((i) => Math.max(Number(attr(i, "width")) || 0, Number(attr(i, "height")) || 0) === 0 || Math.max(Number(attr(i, "width")) || 0, Number(attr(i, "height")) || 0) >= 300)
      .map((i) => abs(attr(i, "src") ?? "", base)),
  ].filter((u, idx, all): u is string => Boolean(u) && all.indexOf(u) === idx).slice(0, 8);

  const usable = (h: string) => h.length >= 3 && h.length <= 60 && !SKIP_HEADING.test(h);
  const koppen = [...new Set((visible.match(/<h[23]\b[^>]*>[\s\S]*?<\/h[23]>/gi) ?? []).map((h) => decode(h.replace(/<[^>]+>/g, " "))).filter(usable))].slice(0, 12);
  const paragraphs = (html: string) => (html.match(/<p\b[^>]*>[\s\S]*?<\/p>/gi) ?? []).map((p) => decode(p.replace(/<[^>]+>/g, " ")));
  // a heading and the paragraphs under it, up to the next heading
  const pieces = visible.split(/(<h[23]\b[^>]*>[\s\S]*?<\/h[23]>)/i);
  const secties: { kop: string; tekst: string }[] = [];
  for (let i = 1; i < pieces.length && secties.length < 12; i += 2) {
    const kop = decode((pieces[i] ?? "").replace(/<[^>]+>/g, " "));
    if (!usable(kop) || secties.some((s) => s.kop === kop)) continue;
    const under = paragraphs((pieces[i + 1] ?? "").split(/<h1\b/i)[0] ?? "").filter((t) => t.length >= 20 && !footerLine(t));
    secties.push({ kop, tekst: under.length ? clipSentences(under.join(" "), 280) : "" });
  }
  const introText = paragraphs(visible).find((t) => t.length >= 120 && !/cookie|©|copyright|privacy|javascript|browser/i.test(t));

  const themeTag = meta("name", "theme-color");
  const theme = themeTag ? attr(themeTag, "content") : null;
  const years = [...text.matchAll(/(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–]\s*)?((?:19|20)\d{2})/gi)].map((m) => Number(m[1]));
  const lower = text.toLowerCase();
  const verouderd = [/<font\b/i.test(visible) && "font-tags", /<center\b/i.test(visible) && "center-tags", /<marquee\b/i.test(visible) && "lopende tekst", /\.swf\b/i.test(html) && "Flash", /<frameset\b/i.test(html) && "frames"].filter((x): x is string => Boolean(x));

  return {
    naam: naam ? naam.slice(0, 80) : null,
    telefoon: tel,
    email,
    straat: addr?.[1]?.trim() ?? null,
    postcode: addr ? `${addr[2]} ${addr[3]}` : null,
    plaats: addr?.[4] ?? null,
    kvk,
    socials,
    logo,
    fotos,
    koppen,
    secties,
    intro: introText ? clipSentences(introText, 600) : null,
    mobiel: tel ? /^(\+?31|0031|0)6\d{8}$/.test(tel) : false,
    kleur: theme && /^#[0-9a-f]{6}$/i.test(theme) ? theme.toUpperCase() : null,
    jaar: years.length ? Math.max(...years) : null,
    whatsapp: hrefs.some((h) => /wa\.me\/|api\.whatsapp\.com|whatsapp:/i.test(h)),
    openingstijden: /openingstijden|openingsuren|geopend van|ma(andag)?\s*(t\/m|-|tot)/i.test(lower) && /\d{1,2}[:.]\d{2}/.test(lower),
    reviews: /review|beoordeling|klantervaring|ervaringen van|kiyoh|klantenvertellen|trustpilot|★|sterren/i.test(lower),
    privacy: hrefs.some((h) => /privacy/i.test(h)) || /privacyverklaring|privacybeleid/i.test(lower),
    boeken: /reserveer|reserveren|boek nu|afspraak maken|plan een afspraak|online bestellen|bestel nu|offerte aanvragen/i.test(lower),
    favicon: tagsOf(html, "link").some((l) => /\bicon\b/i.test(attr(l, "rel") ?? "")),
    verouderd,
  };
}

/** The extra findings for a proposal: trust, look and contact. */
export function proposalFindings(b: BusinessFacts, images: number, now = new Date()): Finding[] {
  const f: Finding[] = [];
  const add = (id: string, category: ExtraCategory, status: FindingStatus, title: string, detail: string) => f.push({ id, category: category as Finding["category"], status, title, detail });
  const year = now.getUTCFullYear();

  // --- vertrouwen
  if (b.kvk) add("kvk", "vertrouwen", "goed", "KVK-nummer staat op de site", `KVK ${b.kvk}.`);
  else add("kvk", "vertrouwen", "let-op", "Geen KVK-nummer gevonden", "Een bedrijf hoort zijn KVK-nummer op de website te zetten. Het geeft bezoekers ook vertrouwen.");
  if (b.postcode) add("adres", "vertrouwen", "goed", "Adres staat op de site", [b.straat, b.postcode, b.plaats].filter(Boolean).join(", "));
  else add("adres", "vertrouwen", "let-op", "Geen adres gevonden", "Een adres laat zien dat er een echt bedrijf achter zit, en helpt in Google Maps.");
  if (b.privacy) add("privacy", "vertrouwen", "goed", "Privacyverklaring gevonden", "Bezoekers kunnen lezen wat je met hun gegevens doet.");
  else add("privacy", "vertrouwen", "probleem", "Geen privacyverklaring", "Wie gegevens van bezoekers verwerkt, bijvoorbeeld via een formulier, moet volgens de AVG uitleggen wat ermee gebeurt.");
  if (b.reviews) add("reviews", "vertrouwen", "goed", "Reviews of klantverhalen", "Ervaringen van anderen overtuigen nieuwe klanten.");
  else add("reviews", "vertrouwen", "let-op", "Geen reviews of klantverhalen", "De meeste klanten lezen eerst ervaringen van anderen voordat ze contact opnemen.");
  if (b.jaar !== null && b.jaar < year - 1) add("jaar", "vertrouwen", "let-op", `De site lijkt niet bijgehouden (© ${b.jaar})`, "Een oud jaartal onderaan geeft bezoekers het gevoel dat er niemand meer naar omkijkt.");

  // --- uitstraling
  if (b.verouderd.length) add("verouderd", "uitstraling", "probleem", "Verouderde techniek", `De site gebruikt ${b.verouderd.join(", ")}. Dat oogt gedateerd en werkt slecht op telefoons.`);
  if (images < 3) add("beeld", "uitstraling", "let-op", "Weinig beeld", "Foto's van je werk, team of winkel maken een site levendig en vertrouwd.");
  else add("beeld", "uitstraling", "goed", `${images} foto's op de pagina`, "Er is genoeg beeld om mee te werken.");
  if (!b.favicon) add("favicon", "uitstraling", "let-op", "Geen eigen icoontje in het tabblad", "Een klein logo in het browsertabblad staat verzorgd en valt op tussen andere tabbladen.");
  if (!b.logo) add("logo", "uitstraling", "let-op", "Geen logo gevonden", "Een duidelijk logo bovenaan maakt je merk herkenbaar.");

  // --- contact
  if (b.openingstijden) add("openingstijden", "contact", "goed", "Openingstijden staan erop", "Bezoekers weten wanneer ze je kunnen bereiken.");
  else add("openingstijden", "contact", "let-op", "Geen openingstijden gevonden", "Veel bezoekers zoeken eerst wanneer je open of bereikbaar bent.");
  if (b.whatsapp) add("whatsapp", "contact", "goed", "WhatsApp-knop", "Klanten kunnen je met één tik een bericht sturen.");
  else add("whatsapp", "contact", "let-op", "Geen WhatsApp-knop", "Veel klanten sturen liever een appje dan dat ze bellen of mailen.");
  if (b.boeken) add("boeken", "contact", "goed", "Online reserveren, bestellen of een offerte", "Bezoekers kunnen direct iets regelen.");
  else add("boeken", "contact", "let-op", "Niets online te regelen", "Een knop voor een afspraak, reservering of offerte levert meer klanten op dan alleen een telefoonnummer.");
  if (b.socials.length) add("socials", "contact", "goed", "Links naar sociale media", `${b.socials.length} gevonden.`);

  return f;
}

/** What ZekerFlex does about each kind of problem, for the proposal. */
const PLAN: [RegExp, string][] = [
  [/^(ttfb|html-size|compression|scripts|blocking|lazy)$/, "Je nieuwe site is een snelle, lichte pagina zonder plugins, met foto's in een modern formaat die pas laden als je ernaartoe scrolt."],
  [/^(viewport|zoom)$/, "Elk ontwerp werkt op telefoon, tablet en computer, en inzoomen kan altijd."],
  [/^(title|description|h1|noindex|robots|sitemap|lang|og|jsonld|alt)$/, "Titels, omschrijvingen, sitemap, robots.txt, deelplaatjes en bedrijfsgegevens voor Google zet ZekerFlex automatisch goed."],
  [/^(https|http-redirect|hsts|headers|mixed|php|version-leak|wp-old|wp-version)$/, "Altijd https met een certificaat dat zichzelf vernieuwt, strenge beveiligingsinstellingen en geen plugins die gehackt kunnen worden."],
  [/^(contact|links|other-site)$/, "Een klikbaar telefoonnummer en een contactformulier dat berichten naar je mail stuurt; wij houden de links heel."],
  [/^(kvk|adres|privacy)$/, "KVK-nummer, adres en een privacyverklaring staan er standaard op."],
  [/^(reviews)$/, "Een blok met reviews, en een nette manier om klanten om een review te vragen."],
  [/^(jaar)$/, "Met Website-beheer houden wij je site bij, veilig en actueel."],
  [/^(verouderd|beeld|favicon|logo)$/, "Een luxe, modern ontwerp in jouw kleuren, met grote foto's en je logo."],
  [/^(openingstijden|whatsapp|boeken|socials)$/, "Openingstijden, een WhatsApp-knop en een knop voor afspraken of offertes staan er direct op."],
];

export function improvementPlan(findings: Finding[]): { finding: Finding; wij: string }[] {
  return findings
    .filter((f) => f.status !== "goed")
    .map((finding) => ({ finding, wij: PLAN.find(([re]) => re.test(finding.id))?.[1] ?? "Dit nemen we mee in je nieuwe site." }));
}

/** Score per extra category, the same way as the free check (100 minus penalties). */
export function extraScores(findings: Finding[]): { id: ExtraCategory; label: string; score: number }[] {
  const penalty: Record<FindingStatus, number> = { goed: 0, "let-op": 12, probleem: 35 };
  return (Object.keys(EXTRA_LABEL) as ExtraCategory[]).map((id) => ({
    id,
    label: EXTRA_LABEL[id],
    score: Math.max(0, 100 - findings.filter((f) => (f.category as string) === id).reduce((s, f) => s + penalty[f.status], 0)),
  }));
}
