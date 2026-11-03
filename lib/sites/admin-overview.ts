import { prisma } from "@/lib/prisma";
import { getDomain } from "@/lib/sites/domain";
import { siteStats } from "@/lib/sites/stats";
import { listContactMessages } from "@/lib/sites/store";
import type { SiteDoc } from "@/lib/sites/types";
import { kvListValues } from "@/lib/storage/kv";

// ---------------------------------------------------------------------------
// Overzicht voor de eigenaar (Beheer → Website-beheer): de websites die bedrijven
// met de bouwer maakten, zonder de voorbeeldsite en de websitevoorstellen. Per
// site: online of niet, het adres (het eigen domein zodra dat actief is), wanneer
// het laatst gepubliceerd is, en wat er de laatste 30 dagen gebeurde: bezoekers
// (lib/sites/stats.ts) en berichten via het contactformulier.
// ---------------------------------------------------------------------------

export interface BuiltSiteRow {
  id: string;
  bedrijf: string;
  online: boolean;
  adres: string;
  eigenDomein: boolean;
  gepubliceerd: string | null;
  /** null: de bezoekerscijfers waren even niet te lezen */
  weergaven: number | null;
  binnenkomsten: number | null;
  berichten: number;
  /** status van het Website-beheer-abonnement, null zonder abonnement */
  beheer: string | null;
}

const DAY = 86_400_000;

export async function builtSitesOverview(baseUrl: string, now = new Date()): Promise<BuiltSiteRow[]> {
  const sites = (await kvListValues<SiteDoc>("site:", 2000)).filter((s) => typeof s?.id === "string" && !s.voorbeeld && !s.voorstel);
  if (sites.length === 0) return [];
  const tenantIds = [...new Set(sites.map((s) => s.tenantId))];
  const [tenants, managed] = await Promise.all([
    prisma.tenant.findMany({ where: { id: { in: tenantIds } }, select: { id: true, name: true } }),
    prisma.managedWebsite.findMany({ where: { tenantId: { in: tenantIds } }, select: { tenantId: true, status: true } }),
  ]);
  const nameOf = new Map(tenants.map((t) => [t.id, t.name]));
  const beheerOf = new Map(managed.map((m) => [m.tenantId, String(m.status)]));
  const since = now.getTime() - 30 * DAY;
  const root = baseUrl.replace(/\/+$/, "");
  return Promise.all(
    sites.map(async (s) => {
      const [domein, stats, berichten] = await Promise.all([
        getDomain(s.id),
        siteStats(s.id, 30, now).catch(() => null),
        listContactMessages(s.id, 200).catch(() => []),
      ]);
      const eigen = Boolean(domein?.activeAt);
      return {
        id: s.id,
        bedrijf: s.bedrijf?.naam || nameOf.get(s.tenantId) || s.slug,
        online: Boolean(s.liveBuild),
        adres: eigen && domein ? `https://${domein.host}` : `${root}/site/${s.slug}`,
        eigenDomein: eigen,
        gepubliceerd: s.builds.reduce<string | null>((last, b) => (!last || b.at > last ? b.at : last), null),
        weergaven: stats ? stats.views : null,
        binnenkomsten: stats ? stats.entries : null,
        berichten: berichten.filter((m) => Date.parse(m.at) >= since).length,
        beheer: beheerOf.get(s.tenantId) ?? null,
      };
    }),
  );
}
