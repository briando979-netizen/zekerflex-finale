import type { SalesDiscoverySource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { redis } from "@/lib/redis";
import { createLead } from "@/lib/sales/leads";

// ---------------------------------------------------------------------------
// Careers-page crawler.
//
// Given a company's public careers / "werken bij" URL it fetches a small,
// bounded set of pages (start URL + linked vacancy pages + sitemap), obeying
// robots.txt and Crawl-delay, and extracts:
//   - a public contact e-mail (prefers hr@/recruitment@ over info@)
//   - up to a handful of open-vacancy titles -> `vacancySignal`
//   - the company name (og:site_name / <title>)
// It only ever touches public HTML. No login walls, no forms, no auth.
// ---------------------------------------------------------------------------

const UA = "ZekerFlexBot/1.0 (+https://zekerflex.com/bot; zakelijke kennismaking)";
const FETCH_TIMEOUT_MS = 12_000;
const MAX_BYTES = 1_800_000;
const RESULT_TTL_S = 60 * 60 * 24;
const ROBOTS_TTL_S = 60 * 60 * 24;

const VACANCY_HINTS = [
  "vacature", "vacatures", "werken-bij", "werkenbij", "werken bij", "careers",
  "career", "jobs", "job", "join-us", "join us", "solliciteer", "open-positions",
  "meewerken",
];
const JOB_TITLE_WORDS =
  /\b(medewerker|monteur|verkoop|kassa|magazijn|logistiek|chauffeur|productie|schoonmaak|horeca|kok|bediening|barista|host|hostess|receptie|verpleeg|verzorg|zorg|technicus|engineer|monteur|allround|parttime|fulltime|oproepkracht|weekendhulp|vakkenvuller|stage|stagiair)\b/i;
const GENERIC_LOCAL_PARTS = ["info", "contact", "office", "mail", "hello", "hallo", "welkom", "sales"];
const PREFERRED_LOCAL_PARTS = [
  "hr", "recruitment", "recruiting", "werving", "personeel", "personeelszaken",
  "vacature", "vacatures", "jobs", "career", "careers", "solliciteren", "sollicitatie",
];
const JUNK_EMAIL = /\.(png|jpe?g|gif|svg|webp|css|js)$|@(sentry|wixpress|example|domain|email|test)\./i;

export interface CareersCrawlResult {
  created: number;
  updated: number;
  pagesFetched: number;
  blockedByRobots: number;
  emailFound: string | null;
  vacancySignal: string | null;
  companyName: string | null;
  note?: string;
}

async function fetchText(
  url: string,
): Promise<{ status: number; contentType: string; body: string } | null> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml,text/plain" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
    if (!res.ok) return { status: res.status, contentType, body: "" };
    if (!/text\/html|text\/plain|application\/xhtml/.test(contentType)) {
      return { status: res.status, contentType, body: "" };
    }
    const buf = await res.arrayBuffer();
    const body = Buffer.from(buf.slice(0, MAX_BYTES)).toString("utf8");
    return { status: res.status, contentType, body };
  } catch (err) {
    logger.warn("careers fetch failed", { url, error: (err as Error).message });
    return null;
  }
}

interface Robots {
  disallow: string[];
  allow: string[];
  crawlDelayMs: number;
}

async function loadRobots(origin: string): Promise<Robots> {
  const cacheKey = `sales:robots:${origin}`;
  const hit = await redis.get(cacheKey).catch(() => null);
  if (hit) return JSON.parse(hit) as Robots;

  const robots: Robots = { disallow: [], allow: [], crawlDelayMs: 0 };
  const res = await fetchText(`${origin}/robots.txt`).catch(() => null);
  const txt = res?.body ?? "";
  if (txt) {
    let applies = false;
    for (const raw of txt.split(/\r?\n/)) {
      const line = raw.replace(/#.*$/, "").trim();
      if (!line) continue;
      const [k, ...rest] = line.split(":");
      const key = (k ?? "").toLowerCase().trim();
      const val = rest.join(":").trim();
      if (key === "user-agent") {
        applies = val === "*" || /zekerflexbot/i.test(val);
      } else if (applies && key === "disallow" && val) {
        robots.disallow.push(val);
      } else if (applies && key === "allow" && val) {
        robots.allow.push(val);
      } else if (applies && key === "crawl-delay") {
        const n = Number(val);
        if (Number.isFinite(n)) robots.crawlDelayMs = Math.min(3000, Math.max(0, n * 1000));
      }
    }
  }
  await redis.set(cacheKey, JSON.stringify(robots), "EX", ROBOTS_TTL_S).catch(() => undefined);
  return robots;
}

function robotsAllows(robots: Robots, path: string): boolean {
  const longestAllow = robots.allow.filter((p) => path.startsWith(p)).sort((a, b) => b.length - a.length)[0];
  const longestDisallow = robots.disallow
    .filter((p) => p && path.startsWith(p))
    .sort((a, b) => b.length - a.length)[0];
  if (!longestDisallow) return true;
  if (longestAllow && longestAllow.length >= longestDisallow.length) return true;
  return false;
}

function extractLinks(html: string, base: URL): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = m[1] ?? "";
    const text = (m[2] ?? "").replace(/<[^>]+>/g, " ").toLowerCase();
    let u: URL;
    try {
      u = new URL(href, base);
    } catch {
      continue;
    }
    if (u.origin !== base.origin) continue;
    const hay = `${u.pathname.toLowerCase()} ${text}`;
    if (VACANCY_HINTS.some((h) => hay.includes(h))) out.add(u.toString().split("#")[0]!);
  }
  return [...out];
}

function extractSitemapUrls(xml: string, base: URL): string[] {
  const out = new Set<string>();
  for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
    const loc = m[1] ?? "";
    let u: URL;
    try {
      u = new URL(loc, base);
    } catch {
      continue;
    }
    if (u.origin !== base.origin) continue;
    if (VACANCY_HINTS.some((h) => u.pathname.toLowerCase().includes(h))) out.add(u.toString());
  }
  return [...out];
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function extractEmails(html: string, siteDomain: string | null): string[] {
  const found = new Set<string>();
  for (const m of html.matchAll(/mailto:([^"'?>\s]+)/gi)) {
    found.add((m[1] ?? "").toLowerCase());
  }
  for (const m of html.matchAll(/\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi)) {
    found.add((m[0] ?? "").toLowerCase());
  }
  const clean = [...found].filter((e) => e.includes("@") && !JUNK_EMAIL.test(e));
  // Rank: preferred local-part on the site's own domain > any on-domain > preferred elsewhere > other.
  const rank = (e: string): number => {
    const [local, dom] = e.split("@");
    const onDomain = siteDomain && dom ? dom.endsWith(siteDomain) : false;
    const lp = (local ?? "").toLowerCase();
    const preferred = PREFERRED_LOCAL_PARTS.some((p) => lp.includes(p));
    const generic = GENERIC_LOCAL_PARTS.includes(lp);
    if (onDomain && preferred) return 0;
    if (onDomain && !generic) return 1;
    if (onDomain) return 2;
    if (preferred) return 3;
    return 4;
  };
  return clean.sort((a, b) => rank(a) - rank(b));
}

function extractTitles(html: string): string[] {
  const titles: string[] = [];
  for (const m of html.matchAll(/<(h1|h2|h3|li|a)\b[^>]*>([\s\S]{3,120}?)<\/\1>/gi)) {
    const text = decodeEntities((m[2] ?? "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    if (text.length >= 4 && text.length <= 80 && JOB_TITLE_WORDS.test(text)) titles.push(text);
  }
  return [...new Set(titles)].slice(0, 6);
}

function extractCompanyName(html: string, fallback: string): string {
  const og = html.match(/<meta\b[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i);
  if (og?.[1]) return decodeEntities(og[1]).trim().slice(0, 120);
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  if (title?.[1]) {
    const t = decodeEntities(title[1]).replace(/\s+/g, " ").trim();
    const first = t.split(/\s+[|–—-]\s+/)[0]?.trim();
    if (first && first.length >= 2) return first.slice(0, 120);
  }
  return fallback;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function crawlCareersSource(
  source: SalesDiscoverySource,
): Promise<CareersCrawlResult> {
  const result: CareersCrawlResult = {
    created: 0,
    updated: 0,
    pagesFetched: 0,
    blockedByRobots: 0,
    emailFound: null,
    vacancySignal: null,
    companyName: null,
  };
  if (!source.url) {
    result.note = "geen URL";
    return result;
  }

  let start: URL;
  try {
    start = new URL(source.url);
  } catch {
    result.note = "ongeldige URL";
    return result;
  }
  if (!/^https?:$/.test(start.protocol)) {
    result.note = "alleen http(s)";
    return result;
  }

  const cacheKey = `sales:careers:${start.origin}${start.pathname}`;
  const cached = await redis.get(cacheKey).catch(() => null);
  if (cached && !process.env.VITEST) {
    return { ...(JSON.parse(cached) as CareersCrawlResult), note: "gecachet (24u)" };
  }

  const robots = await loadRobots(start.origin);
  const siteDomain = start.hostname.replace(/^www\./, "");

  const queue: string[] = [];
  if (robotsAllows(robots, start.pathname)) queue.push(start.toString());
  else result.blockedByRobots += 1;

  // sitemap
  const sitemap = await fetchText(`${start.origin}/sitemap.xml`);
  if (sitemap?.body) {
    for (const u of extractSitemapUrls(sitemap.body, start).slice(0, 8)) {
      const p = new URL(u).pathname;
      if (robotsAllows(robots, p)) queue.push(u);
      else result.blockedByRobots += 1;
    }
  }

  const seen = new Set<string>();
  const emails: string[] = [];
  const titles: string[] = [];
  let companyName = source.label?.trim() || start.hostname.replace(/^www\./, "");

  while (queue.length && result.pagesFetched < env.SALES_CRAWL_MAX_PAGES) {
    const url = queue.shift()!;
    if (seen.has(url)) continue;
    seen.add(url);

    const page = await fetchText(url);
    result.pagesFetched += 1;
    if (robots.crawlDelayMs) await sleep(robots.crawlDelayMs);
    if (!page || !page.body) continue;

    companyName = extractCompanyName(page.body, companyName);
    emails.push(...extractEmails(page.body, siteDomain));
    titles.push(...extractTitles(page.body));

    if (result.pagesFetched < env.SALES_CRAWL_MAX_PAGES) {
      for (const link of extractLinks(page.body, start)) {
        if (seen.has(link) || queue.includes(link)) continue;
        if (!robotsAllows(robots, new URL(link).pathname)) {
          result.blockedByRobots += 1;
          continue;
        }
        queue.push(link);
      }
    }
  }

  const email = [...new Set(emails)].filter((e) => !JUNK_EMAIL.test(e))[0] ?? null;
  const uniqueTitles = [...new Set(titles)].slice(0, 5);
  const vacancySignal = uniqueTitles.length
    ? `Open vacatures gezien: ${uniqueTitles.join("; ")}`
    : null;

  result.emailFound = email;
  result.vacancySignal = vacancySignal;
  result.companyName = companyName;

  // Create or refresh the lead behind this careers site.
  const existing = await prisma.salesLead.findFirst({
    where: {
      OR: [
        { sourceUrl: { startsWith: start.origin } },
        ...(email ? [{ contactEmail: email }, { discoveredEmail: email }] : []),
      ],
    },
  });

  if (existing) {
    await prisma.salesLead.update({
      where: { id: existing.id },
      data: {
        ...(vacancySignal ? { vacancySignal } : {}),
        ...(email && !existing.contactEmail ? { contactEmail: email } : {}),
        ...(email ? { discoveredEmail: email } : {}),
        ...(existing.sourceUrl ? {} : { sourceUrl: start.toString() }),
      },
    });
    result.updated = 1;
  } else if (companyName) {
    await createLead({
      companyName,
      source: "careers",
      sourceUrl: start.toString(),
      ...(email ? { contactEmail: email, discoveredEmail: email } : {}),
      ...(vacancySignal ? { vacancySignal } : {}),
      createdById: null,
      ...(source.campaignId ? { campaignId: source.campaignId } : {}),
    });
    result.created = 1;
  }

  await redis.set(cacheKey, JSON.stringify(result), "EX", RESULT_TTL_S).catch(() => undefined);
  logger.info("careers crawl run", { url: source.url, ...result });
  return result;
}
