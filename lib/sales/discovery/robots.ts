import { fetchPage } from "@/lib/website-check/fetch";
import { logger } from "@/lib/logger";
import { redis } from "@/lib/redis";

// ---------------------------------------------------------------------------
// robots.txt voor de sales-bot: de careers-crawler (careers.ts) en de
// contact-scraper (contact-scrape.ts) lezen hem hier, met dezelfde cache van
// 24 uur per origin en dezelfde Crawl-delay (hooguit 3 s). Een robots.txt die
// niet op te halen is, telt als "alles mag" (zoals een gewone zoekmachine).
// ---------------------------------------------------------------------------

const UA = "ZekerFlexBot/1.0 (+https://zekerflex.com/bot; zakelijke kennismaking)";
const FETCH_TIMEOUT_MS = 12_000;
const MAX_BYTES = 1_800_000;
const ROBOTS_TTL_S = 60 * 60 * 24;

export interface Robots {
  disallow: string[];
  allow: string[];
  crawlDelayMs: number;
}

async function robotsTekst(origin: string): Promise<string> {
  try {
    // via de beveiligde fetcher: nooit naar het eigen netwerk (ook niet via een redirect), begrensd in tijd en grootte
    const res = await fetchPage(`${origin}/robots.txt`, { timeoutMs: FETCH_TIMEOUT_MS, maxBytes: MAX_BYTES, userAgent: UA });
    const contentType = (res.headers["content-type"] ?? "").toLowerCase();
    if (res.status < 200 || res.status >= 300) return "";
    if (!/text\/html|text\/plain|application\/xhtml/.test(contentType)) return "";
    return res.body.slice(0, MAX_BYTES);
  } catch (err) {
    logger.warn("robots.txt niet op te halen", { error: (err as Error).message });
    return "";
  }
}

export async function loadRobots(origin: string): Promise<Robots> {
  const cacheKey = `sales:robots:${origin}`;
  const hit = await redis.get(cacheKey).catch(() => null);
  if (hit) return JSON.parse(hit) as Robots;

  const robots: Robots = { disallow: [], allow: [], crawlDelayMs: 0 };
  const txt = await robotsTekst(origin);
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

export function robotsAllows(robots: Robots, path: string): boolean {
  const longestAllow = robots.allow.filter((p) => path.startsWith(p)).sort((a, b) => b.length - a.length)[0];
  const longestDisallow = robots.disallow
    .filter((p) => p && path.startsWith(p))
    .sort((a, b) => b.length - a.length)[0];
  if (!longestDisallow) return true;
  if (longestAllow && longestAllow.length >= longestDisallow.length) return true;
  return false;
}
