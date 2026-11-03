import { amsterdamDayKey, amsterdamStartOfDay } from "@/lib/time/amsterdam";

// ---------------------------------------------------------------------------
// Bezoekers van een klantsite tellen, zonder cookies en zonder iets over een
// bezoeker te bewaren (lib/sites/stats.ts houdt alleen tellers per dag bij).
// Een gebouwde site draait geen scripts, dus we tellen op de server, bij het
// serveren van een pagina. Per weergave bepalen we:
//   · mens of robot: zoekmachines, linkvoorbeelden (WhatsApp, Slack…),
//     meetdiensten en onze eigen meters ("ZekerFlex…") tellen niet mee;
//   · binnenkomst of klik binnen de site. De sandbox (lib/security/csp.ts) geeft
//     de pagina een "opaque origin": een interne klik heeft daardoor géén
//     Referer en heet cross-site. Een binnenkomst heeft een Referer van een
//     andere site, of Sec-Fetch-Site "none" (getypt, bladwijzer, link uit een app);
//   · de bron van een binnenkomst, in een paar vaste groepen (geen losse adressen:
//     zo blijft de lijst kort en kan niemand hem volspammen);
//   · telefoon of computer.
// Puur (alleen tijdhulpjes): de bouwer gebruikt de labels en sommen ook.
// ---------------------------------------------------------------------------

export type VisitSource = "google" | "zoekmachine" | "social" | "ai" | "andere-site" | "rechtstreeks";

export const SOURCE_LABEL: Record<VisitSource, string> = {
  google: "Google",
  zoekmachine: "Andere zoekmachines",
  social: "Sociale media",
  ai: "AI-assistenten",
  "andere-site": "Andere websites",
  rechtstreeks: "Rechtstreeks (getypt, bladwijzer of app)",
};

const isSource = (s: string): s is VisitSource => Object.hasOwn(SOURCE_LABEL, s);

export interface VisitHeaders {
  method: string;
  userAgent: string | null;
  referer: string | null;
  secFetchSite: string | null;
  secFetchDest: string | null;
  purpose: string | null;
}

export interface Visit {
  /** someone arriving from elsewhere (not a click within the site) */
  entry: boolean;
  source: VisitSource | null;
  mobile: boolean;
}

export function visitHeadersOf(request: Request): VisitHeaders {
  const h = request.headers;
  return {
    method: request.method,
    userAgent: h.get("user-agent"),
    referer: h.get("referer"),
    secFetchSite: h.get("sec-fetch-site"),
    secFetchDest: h.get("sec-fetch-dest"),
    purpose: h.get("sec-purpose") ?? h.get("purpose") ?? h.get("x-moz"),
  };
}

const ROBOT = /bot|crawl|spider|slurp|archiver|facebookexternalhit|embedly|preview|whatsapp|telegram|discord|slack|skype|pinterest|curl|wget|python|http-?client|okhttp|axios|node-fetch|undici|go-http|java\/|libwww|scrapy|headless|phantom|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|statuscake|zekerflex/i;
const MOBILE = /mobi|android|iphone|ipad|ipod|tablet|silk|kindle|opera mini/i;

// in this order: Gemini lives on google.com, but is an AI assistant
const SOURCES: [RegExp, VisitSource][] = [
  [/(^|\.)(chatgpt\.com|openai\.com|perplexity\.ai|claude\.ai|gemini\.google\.com|copilot\.microsoft\.com)$/, "ai"],
  [/(^|\.)google\.[a-z]{2,3}(\.[a-z]{2})?$/, "google"],
  [/(^|\.)(bing\.com|duckduckgo\.com|ecosia\.org|yahoo\.com|startpage\.com|qwant\.com|search\.brave\.com|yandex\.[a-z]+|baidu\.com)$/, "zoekmachine"],
  [/(^|\.)(facebook\.com|fb\.com|instagram\.com|linkedin\.com|lnkd\.in|tiktok\.com|t\.co|x\.com|twitter\.com|pinterest\.[a-z.]+|youtube\.com|reddit\.com|whatsapp\.com|snapchat\.com|threads\.net)$/, "social"],
];

const bare = (host: string) => host.toLowerCase().replace(/^www\./, "");

function refererHost(url: string | null): string | null {
  if (!url) return null;
  try {
    return bare(new URL(url).hostname) || null;
  } catch {
    return null;
  }
}

export function sourceOf(host: string): VisitSource {
  for (const [re, source] of SOURCES) if (re.test(host)) return source;
  return "andere-site";
}

/** What one page request means for the figures; null = don't count it (not a person, or not a page view). */
export function classifyVisit(h: VisitHeaders, ownHosts: string[]): Visit | null {
  if (h.method !== "GET") return null;
  // every real browser (in-app browsers too) starts with Mozilla/; scripts ("node", curl,
  // python-requests…) don't, and robots that do say so further on
  const ua = h.userAgent ?? "";
  if (!ua.startsWith("Mozilla/") || ROBOT.test(ua)) return null;
  // a browser fetching ahead is not a visit (yet)
  if (/prefetch|prerender/i.test(h.purpose ?? "")) return null;
  // only a page opened as a page, not inside someone else's frame
  if (h.secFetchDest && h.secFetchDest !== "document") return null;
  const mobile = MOBILE.test(ua);
  const ref = refererHost(h.referer);
  if (ref && !ownHosts.map(bare).includes(ref)) return { entry: true, source: sourceOf(ref), mobile };
  if (ref) return { entry: false, source: null, mobile };
  // No referer: typed, a bookmark or a link in an app says "none"; a click inside the sandboxed
  // site says "cross-site". Old browsers send neither, so they count as direct.
  if (h.secFetchSite === "none" || h.secFetchSite === null) return { entry: true, source: "rechtstreeks", mobile };
  return { entry: false, source: null, mobile };
}

export interface SiteStats {
  days: { day: string; views: number; entries: number }[];
  views: number;
  entries: number;
  /** views on a phone or tablet */
  mobile: number;
  pages: { slug: string; views: number }[];
  sources: { source: VisitSource; entries: number }[];
}

/** The last `count` Amsterdam calendar days up to and including today, oldest first. */
export function lastDays(count: number, now = new Date()): string[] {
  return Array.from({ length: count }, (_, i) => amsterdamDayKey(amsterdamStartOfDay(now, i - count + 1)));
}

/** Adds up the day counters (field → number, as Redis returns them) of `days`. */
export function sumStats(days: string[], hashes: (Record<string, string> | null)[]): SiteStats {
  const pages = new Map<string, number>();
  const sources = new Map<VisitSource, number>();
  const total = { views: 0, entries: 0, mobile: 0 };
  const perDay = days.map((day, i) => {
    const h = hashes[i] ?? {};
    const n = (field: string) => Math.max(0, Number(h[field] ?? 0) || 0);
    total.views += n("v");
    total.entries += n("e");
    total.mobile += n("d:mobiel");
    for (const field of Object.keys(h)) {
      if (field.startsWith("p:")) pages.set(field.slice(2), (pages.get(field.slice(2)) ?? 0) + n(field));
      const s = field.slice(2);
      if (field.startsWith("s:") && isSource(s)) sources.set(s, (sources.get(s) ?? 0) + n(field));
    }
    return { day, views: n("v"), entries: n("e") };
  });
  return {
    days: perDay,
    ...total,
    pages: [...pages].map(([slug, views]) => ({ slug, views })).sort((a, b) => b.views - a.views),
    sources: [...sources].map(([source, entries]) => ({ source, entries })).sort((a, b) => b.entries - a.entries),
  };
}
