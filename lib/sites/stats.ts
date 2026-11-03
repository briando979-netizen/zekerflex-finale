import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { lastDays, sumStats, type SiteStats, type Visit } from "@/lib/sites/stats-shared";

// ---------------------------------------------------------------------------
// Bezoekerscijfers van klantsites (zie lib/sites/stats-shared.ts voor wat er
// geteld wordt). Eén Redis-hash per site per dag, site-stats:<siteId>:<dag>:
//   v  weergaven · e  binnenkomsten · p:<pagina>  weergaven per pagina
//   s:<bron>  binnenkomsten per bron · d:mobiel / d:computer
// Niets per bezoeker. Redis bewaart met AOF (docker-compose.vps.yml); na 400
// dagen vervalt een dag vanzelf. Redis pas laden als er geteld wordt, zodat een
// module die serve.ts importeert (en elke test) geen verbinding opent.
// ---------------------------------------------------------------------------

const KEEP_SECONDS = 400 * 86_400;
const key = (siteId: string, day: string) => `site-stats:${siteId}:${day}`;

export async function recordSiteView(siteId: string, slug: string, visit: Visit, now = new Date()): Promise<void> {
  const { redis } = await import("@/lib/redis");
  const k = key(siteId, amsterdamDayKey(now));
  const m = redis.multi().hincrby(k, "v", 1).hincrby(k, `p:${slug}`, 1).hincrby(k, visit.mobile ? "d:mobiel" : "d:computer", 1);
  if (visit.entry && visit.source) m.hincrby(k, "e", 1).hincrby(k, `s:${visit.source}`, 1);
  await m.expire(k, KEEP_SECONDS).exec();
}

export async function siteStats(siteId: string, dayCount: number, now = new Date()): Promise<SiteStats> {
  const { redis } = await import("@/lib/redis");
  const days = lastDays(dayCount, now);
  const pipe = redis.pipeline();
  for (const day of days) pipe.hgetall(key(siteId, day));
  const res = (await pipe.exec()) ?? [];
  return sumStats(days, days.map((_, i) => {
    const [err, hash] = res[i] ?? [null, null];
    return err ? null : (hash as Record<string, string> | null);
  }));
}
