// ---------------------------------------------------------------------------
// /klus-plaatsen: een bedrijf vult zijn website in en krijgt zijn klus op maat.
// Uit de openbare voorpagina (lib/website-check/proposal.ts extractBusiness)
// halen we de naam, de plaats, het logo en een zin over het bedrijf, en raden
// we welke functie past. Puur en browser-veilig: de route doet het ophalen,
// het formulier (components/marketing/KlusConcept.tsx) gebruikt de uitkomst.
// ---------------------------------------------------------------------------

/** What the route returns about one website; everything may be missing. */
export interface WebsiteKlus {
  host: string;
  bedrijf: string | null;
  plaats: string | null;
  /** a SHIFT_TEMPLATES key, or null when nothing on the page points to one */
  templateKey: string | null;
  /** one or two sentences in the company's own words */
  over: string | null;
  /** brand colour #RRGGBB */
  kleur: string | null;
  /** small WebP as a data URL (our own copy; never the company's own address) */
  logo: string | null;
}

const WORD = (words: string) => new RegExp(`(?<![\\p{L}\\d])(?:${words})(?![\\p{L}\\d])`, "giu");

/** Words on a company's front page that point to one of the shift templates. Order breaks a tie. */
const SIGNALS: [string, RegExp][] = [
  ["horeca", WORD("restaurant|caf[eé]|eetcaf[eé]|grand caf[eé]|bistro|brasserie|lunchroom|bar|hotel|catering|pizzeria|grillroom|snackbar|strandpaviljoen|terras|menukaart|diner|lunch|ontbijt|high tea|horeca|bediening|koffiebar|eten en drinken|feesten|partycentrum|feestzaal|escaperooms?")],
  ["magazijn", WORD("magazijn|logistiek|logistics|transport|distributie|distributiecentrum|warehouse|fulfil?ment|orderpick\\p{L}*|expeditie|opslag|koeriers?|groothandel|productie|verzending")],
  ["schoonmaak", WORD("schoonmaak\\p{L}*|glazenwass\\p{L}*|reiniging|facilitair\\p{L}*|cleaning|housekeeping|hygi[eë]ne")],
  ["vakkenvuller", WORD("supermarkt|bouwmarkt|drogist\\p{L}*|tuincentrum|retail|filialen|assortiment|levensmiddelen|boodschappen")],
  ["kassa", WORD("winkel|boetiek|boutique|mode|kleding|schoenen|fashion|bakkerij|slagerij|kaasspeciaalzaak|cadeauwinkel|juwelier|bloemist\\p{L}*|kapsalon")],
  ["receptie", WORD("kantoor|receptie|praktijk|kliniek|tandarts\\p{L}*|fysiotherap\\p{L}*|huisarts\\p{L}*|advocaten?|accountants?|notaris|makelaar\\p{L}*|sportschool|fitness")],
  // the other branches of lib/shifts/catalogus.ts; after the first six, which win a tie
  ["productie", WORD("fabriek|productiebedrijf|productielocatie|machinefabriek|metaalbewerking|voedingsmiddelenindustrie|vleesverwerk\\p{L}*|verpakkingsindustrie")],
  ["beveiliger", WORD("beveiligingsbedrijf|beveiligingsdienst|bewakingsdienst|security|alarmcentrale|objectbeveiliging")],
  ["promotie", WORD("promotiebureau|promotieteam|sampling|eventmarketing|merkactivatie|promotieacties?")],
  ["eventcrew", WORD("evenementenbureau|eventbureau|festivals?|tentenverhuur|podiumbouw|evenementenverhuur")],
  ["pedagogisch", WORD("kinderopvang|kinderdagverblijf|kdv|bso|buitenschoolse opvang|peuteropvang|peuterspeelzaal")],
  ["onderwijsassistent", WORD("basisschool|basisonderwijs|middelbare school|scholengemeenschap")],
  ["zorghulp", WORD("thuiszorg|zorginstelling|verpleeghuis|woonzorg\\p{L}*|zorgcentrum|verzorgingshuis")],
  ["bouwplaats", WORD("bouwbedrijf|aannemer\\p{L}*|bouwonderneming|renovatiebedrijf")],
  ["schilder", WORD("schildersbedrijf|schilderwerk(en)?|schildersbedrijven")],
  ["installatiemonteur", WORD("installatiebedrijf|installateur|loodgieter\\p{L}*|cv-ketels?|warmtepompen")],
  ["wasstraat", WORD("wasstraat|carwash|autowas\\p{L}*|autopoets\\p{L}*")],
  ["automonteur", WORD("autobedrijf|autogarage|apk|autoservice|occasions|autodealer")],
  ["bandenwissel", WORD("bandenservice|bandencentrale|bandenspecialist|winterbanden")],
  ["fietsenmaker", WORD("fietsenwinkel|fietsenmaker|fietsspeciaalzaak|fietsenzaak|e-bikes?|fietsreparatie")],
  ["kaswerk", WORD("kwekerij|glastuinbouw|tuinbouwbedrijf|tomatenkwekerij|paprikateelt|kassen")],
  ["oogst", WORD("fruitteler\\p{L}*|fruitteelt|aardbeienkwekerij|akkerbouw\\p{L}*|boerderij")],
  ["hovenier", WORD("hovenier\\p{L}*|tuinaanleg|tuinonderhoud|groenvoorziening")],
  ["verhuizer", WORD("verhuisbedrijf|verhuizingen|verhuisservice")],
];

const count = (re: RegExp, s: string) => (s.match(re) ?? []).length;

/**
 * The best-fitting template for what the page says about the company: the title
 * weighs most, then the headings, then the intro and description. Null when no
 * word points anywhere (the visitor then picks the function themselves).
 */
export function guessTemplate(page: { title: string; koppen: string[]; tekst: string }): string | null {
  let best: string | null = null;
  let bestScore = 0;
  for (const [key, re] of SIGNALS) {
    const score = 3 * count(re, page.title) + 2 * page.koppen.reduce((n, k) => n + count(re, k), 0) + count(re, page.tekst);
    if (score > bestScore) {
      best = key;
      bestScore = score;
    }
  }
  return best;
}

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };
const decode = (s: string) =>
  s
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
      const k = e.toLowerCase();
      if (ENT[k] !== undefined) return ENT[k];
      if (k.startsWith("#x")) return String.fromCodePoint(parseInt(k.slice(2), 16) || 32);
      if (k.startsWith("#")) return String.fromCodePoint(Number(k.slice(1)) || 32);
      return m;
    })
    .replace(/\s+/g, " ")
    .trim();

const metaContent = (html: string, name: string): string | null => {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = /\s(?:name|property)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    if (key !== name) continue;
    const content = /\scontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
    const v = decode(content?.[1] ?? content?.[2] ?? "");
    if (v) return v;
  }
  return null;
};

/** The page title and its description: what search engines show, so the company's own summary. */
export function pageSummary(html: string): { title: string; description: string | null } {
  const title = decode(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "");
  return { title, description: metaContent(html, "description") ?? metaContent(html, "og:description") };
}

/** A square icon (apple-touch-icon) when the page has no image called "logo". */
export function iconHref(html: string, pageUrl: string): string | null {
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    if (!/\srel\s*=\s*["']?[^"'>]*apple-touch-icon/i.test(tag)) continue;
    const href = /\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
    const raw = href?.[1] ?? href?.[2] ?? href?.[3];
    if (!raw) continue;
    try {
      const u = new URL(decode(raw), pageUrl);
      if (u.protocol === "https:" || u.protocol === "http:") return u.toString();
    } catch {
      /* not an address */
    }
  }
  return null;
}

/** A known town named in the text (with its capital, so no common word), longest name first. */
export function cityFromText(text: string, cities: readonly string[]): string | null {
  for (const city of [...cities].sort((a, b) => b.length - a.length)) {
    const re = new RegExp(`(?<![\\p{L}])${city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}])`, "u");
    if (re.test(text)) return city;
  }
  return null;
}

/** The company name as a card shows it: no "Home –", no slogan after a bar, at most 60 characters. */
export function cleanBedrijf(naam: string | null): string | null {
  if (!naam) return null;
  const first = naam
    .split(/\s+[|–—·]\s+|\s+-\s+/)
    .map((p) => p.trim())
    .find((p) => p && !/^(home|homepage|welkom|start)$/i.test(p));
  const out = (first ?? "").replace(/^(welkom bij|welcome to)\s+/i, "").trim();
  if (out.length < 2 || /^https?:|\.(nl|com|eu|be)$/i.test(out)) return null;
  return out.length > 60 ? `${out.slice(0, 59).trimEnd()}…` : out;
}

export const isHex = (s: string | null | undefined): s is string => typeof s === "string" && /^#[0-9a-fA-F]{6}$/.test(s);

/** The template's own description, made about this company. The visitor can still change every word. */
export function websiteOmschrijving(templateDescription: string, w: Pick<WebsiteKlus, "bedrijf" | "plaats" | "over">): string {
  const waar = w.bedrijf ? ` Je werkt bij ${w.bedrijf}${w.plaats ? ` in ${w.plaats}` : ""}.` : w.plaats ? ` De klus is in ${w.plaats}.` : "";
  const over = w.over ? `\n\nOver ${w.bedrijf ?? "ons"}: ${w.over}` : "";
  return `${templateDescription}${waar}${over}`.slice(0, 2000);
}

/** Initials for the logo circle when the site has no usable logo. */
export function initialen(bedrijf: string | null): string {
  const words = (bedrijf ?? "").split(/\s+/).filter((w) => /^\p{L}/u.test(w) && !/^(de|het|een|van|der|den|en|b\.?v\.?|v\.?o\.?f\.?)$/i.test(w));
  const letters = words.slice(0, 2).map((w) => w[0]!.toUpperCase());
  return letters.join("") || "?";
}
