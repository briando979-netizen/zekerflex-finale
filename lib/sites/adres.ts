import { env } from "@/lib/env";
import { getDomain } from "@/lib/sites/domain";
import type { SiteDoc } from "@/lib/sites/types";

/**
 * Waar bezoekers een site vinden: het eigen domein zodra dat actief is, anders /site/<naam> op ZekerFlex
 * (zoals GET /api/werkgever/sites het adres geeft). `origin` + `root` zoals lib/sites/serve.ts ze gebruikt;
 * `adres` zonder slash aan het eind ("https://jouwwinkel.nl", "https://zekerflex.com/site/jouwwinkel").
 */
export async function siteAdres(site: Pick<SiteDoc, "id" | "slug">): Promise<{ origin: string; root: string; adres: string; eigenDomein: boolean }> {
  const domein = await getDomain(site.id);
  if (domein?.activeAt) return { origin: `https://${domein.host}`, root: "/", adres: `https://${domein.host}`, eigenDomein: true };
  const origin = new URL(env.APP_BASE_URL).origin;
  return { origin, root: `/site/${site.slug}/`, adres: `${origin}/site/${site.slug}`, eigenDomein: false };
}
