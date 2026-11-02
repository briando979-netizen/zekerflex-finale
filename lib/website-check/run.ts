import { createHash, randomBytes } from "node:crypto";
import { kvGet, kvListValues, kvSet } from "@/lib/storage/kv";
import { logger } from "@/lib/logger";
import { FetchError, fetchPage, type FetchedPage } from "@/lib/website-check/fetch";
import { buildFindings, extractFacts, scoreFindings, type CheckCategory, type Finding } from "@/lib/website-check/analyze";

// ---------------------------------------------------------------------------
// Gratis website-check (zekerflex.com/website-check): haalt de pagina op, meet
// snelheid, Google-instellingen, veiligheid en een handvol links, en bewaart
// het rapport onder een niet te raden id zodat het te delen is. Een rapport
// bevat alleen openbare gegevens over een openbare website, geen persoonsdata.
// Dezelfde pagina binnen een uur opnieuw: het bewaarde rapport, geen nieuwe
// meting (scheelt verkeer naar die site).
// ---------------------------------------------------------------------------

export interface WebsiteCheckResult {
  id: string;
  at: string;
  url: string;
  finalUrl: string;
  host: string;
  score: number;
  categories: { id: CheckCategory; label: string; score: number }[];
  findings: Finding[];
  metrics: {
    ttfbMs: number;
    totalMs: number;
    htmlBytes: number;
    transferBytes: number;
    scripts: number;
    images: number;
    linksChecked: number;
    brokenLinks: number;
  };
  platform: string | null;
  leadId: string | null;
}

const KEY = (id: string) => `website-check:${id}`;
const RECENT_KEY = (hash: string) => `website-check-recent:${hash}`;
const REUSE_MS = 60 * 60_000;
const MAX_LINKS = 20;
const LINK_CONCURRENCY = 5;

export const isCheckId = (id: string) => /^[a-f0-9]{16}$/.test(id);

/** Maakt van wat iemand intypt een volledig adres ("bakkerij.nl" → "https://bakkerij.nl/"). */
export function normalizeInput(raw: string): string {
  const s = raw.trim();
  if (!s) throw new FetchError("Vul het adres van je website in.", "INVALID_URL");
  const withProto = /^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`;
  let u: URL;
  try {
    u = new URL(withProto);
  } catch {
    throw new FetchError("Dit is geen geldig webadres.", "INVALID_URL");
  }
  u.hash = "";
  return u.toString();
}

/** bakkerij.nl, www.bakkerij.nl en shop.bakkerij.nl horen bij dezelfde website */
export function sameSite(a: string, b: string): boolean {
  const x = a.toLowerCase().replace(/^www\./, "");
  const y = b.toLowerCase().replace(/^www\./, "");
  return x === y || x.endsWith(`.${y}`) || y.endsWith(`.${x}`);
}

async function settle<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch {
    return null;
  }
}

async function checkLinks(urls: string[]): Promise<{ url: string; status: number | null }[]> {
  const out: { url: string; status: number | null }[] = [];
  const queue = urls.slice(0, MAX_LINKS);
  await Promise.all(
    Array.from({ length: LINK_CONCURRENCY }, async () => {
      for (let next = queue.shift(); next; next = queue.shift()) {
        const res = await settle(fetchPage(next, { headersOnly: true, timeoutMs: 6_000, maxRedirects: 3 }));
        out.push({ url: next, status: res?.status ?? null });
      }
    }),
  );
  return out;
}

export async function runWebsiteCheck(rawInput: string): Promise<WebsiteCheckResult> {
  const url = normalizeInput(rawInput);
  const hash = createHash("sha256").update(url).digest("hex").slice(0, 32);

  const recent = await kvGet<{ id: string; at: string }>(RECENT_KEY(hash)).catch(() => null);
  if (recent && Date.now() - Date.parse(recent.at) < REUSE_MS) {
    const cached = await getWebsiteCheck(recent.id);
    if (cached) return cached;
  }

  let page: FetchedPage;
  try {
    page = await fetchPage(url, { timeoutMs: 12_000 });
  } catch (err) {
    // Wie "https://" niet typte en een site zonder certificaat heeft: probeer http.
    if (err instanceof FetchError && (err.code === "NETWORK" || err.code === "TIMEOUT") && !/^https?:\/\//i.test(rawInput.trim())) {
      page = await fetchPage(url.replace(/^https:/, "http:"), { timeoutMs: 12_000 });
    } else {
      throw err;
    }
  }
  if (page.status >= 400) {
    throw new FetchError(`De website gaf foutcode ${page.status} terug. Kijk of het adres klopt.`, "NETWORK");
  }

  const final = new URL(page.finalUrl);
  const requested = new URL(url);
  // Stuurt het adres door naar een ándere website (bijv. een toestemmingspagina van
  // een uitgever), dan horen robots.txt en de sitemap nog bij de site zelf.
  const crossSite = !sameSite(requested.hostname, final.hostname);
  const origin = crossSite ? requested.origin : final.origin;
  const facts = extractFacts(page.body, page.finalUrl, page.headers);

  const [httpVersion, robots, links] = await Promise.all([
    settle(fetchPage(`http://${crossSite ? requested.host : final.host}/`, { headersOnly: true, timeoutMs: 6_000 })),
    settle(fetchPage(`${origin}/robots.txt`, { timeoutMs: 6_000, maxRedirects: 2 })),
    crossSite ? Promise.resolve([]) : checkLinks(facts.internalLinks),
  ]);
  const robotsTxt = robots && robots.status === 200 && !/<html/i.test(robots.body.slice(0, 500)) ? robots.body.slice(0, 50_000) : null;
  const sitemapUrl = /^\s*sitemap\s*:\s*(\S+)/im.exec(robotsTxt ?? "")?.[1] ?? `${origin}/sitemap.xml`;
  const sitemap = await settle(fetchPage(sitemapUrl, { headersOnly: true, timeoutMs: 6_000, maxRedirects: 3 }));

  const findings = buildFindings(
    { finalUrl: page.finalUrl, status: page.status, headers: page.headers, html: page.body, bytes: page.bytes, transferBytes: page.transferBytes, ttfbMs: page.ttfbMs },
    facts,
    {
      httpRedirectsTo: httpVersion?.finalUrl ?? null,
      robotsTxt,
      sitemapFound: Boolean(sitemap && sitemap.status === 200),
      links,
      redirectedToOtherSite: crossSite ? final.hostname : null,
    },
  );
  const { score, categories } = scoreFindings(findings);

  const result: WebsiteCheckResult = {
    id: randomBytes(8).toString("hex"),
    at: new Date().toISOString(),
    url,
    finalUrl: page.finalUrl,
    host: crossSite ? requested.hostname : final.hostname,
    score,
    categories,
    findings,
    metrics: {
      ttfbMs: page.ttfbMs,
      totalMs: page.totalMs,
      htmlBytes: page.bytes,
      transferBytes: page.transferBytes,
      scripts: facts.scripts,
      images: facts.images,
      linksChecked: links.length,
      brokenLinks: links.filter((l) => l.status === null || l.status >= 400).length,
    },
    platform: facts.platform,
    leadId: null,
  };
  await kvSet(KEY(result.id), result);
  await kvSet(RECENT_KEY(hash), { id: result.id, at: result.at }).catch(() => undefined);
  logger.info("website check done", { host: result.host, score, findings: findings.length });
  return result;
}

export async function getWebsiteCheck(id: string): Promise<WebsiteCheckResult | null> {
  if (!isCheckId(id)) return null;
  return kvGet<WebsiteCheckResult>(KEY(id)).catch(() => null);
}

export async function markCheckLead(id: string, leadId: string): Promise<void> {
  const rec = await getWebsiteCheck(id);
  if (!rec) return;
  await kvSet(KEY(id), { ...rec, leadId });
}

/** Voor beheer: de laatste checks, nieuwste eerst. */
export async function listWebsiteChecks(limit = 200): Promise<WebsiteCheckResult[]> {
  const rows = await kvListValues<WebsiteCheckResult>("website-check:", 2000).catch(() => []);
  return rows
    .filter((r) => r && typeof r.id === "string" && typeof r.at === "string" && typeof r.score === "number")
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit);
}
