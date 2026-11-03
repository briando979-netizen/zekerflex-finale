import { prisma } from "@/lib/prisma";
import { safe, type Period } from "@/lib/admin/period";

// De trechter van de openbare rekentools, voor Admin → Sales: hoe vaak een tool
// bekeken is, hoe vaak iemand hem echt invulde (één anonieme INTERACTION per
// bezoek, zie useEersteGebruik) en hoeveel leads "Stuur mij de uitkomst" gaf.

export const REKENTOOLS = [
  { key: "kosten-uitzendkracht", label: "Kosten uitzendkracht of zzp'er", path: "/rekentools/kosten-uitzendkracht-berekenen", leads: true },
  { key: "wet-dba-check", label: "Wet DBA-check", path: "/rekentools/wet-dba-check", leads: true },
  { key: "zzp-uurtarief", label: "Zzp-uurtarief", path: "/rekentools/zzp-uurtarief-berekenen", leads: false },
  // Not a rekentool, but the same funnel: draft a klus, then sign up (components/marketing/KlusConcept.tsx).
  { key: "klus-concept", label: "Klus samenstellen", path: "/klus-plaatsen", leads: false },
] as const;

export interface RekentoolRow {
  key: string;
  label: string;
  path: string;
  views: number;
  used: number;
  /** null for a tool without "Stuur mij de uitkomst" */
  leads: number | null;
}

/** Joins the three counts per tool; a tool nobody visited still gets a row of zeroes. */
export function rekentoolRows(counts: { views: Record<string, number>; used: Record<string, number>; leads: Record<string, number> }): RekentoolRow[] {
  return REKENTOOLS.map((t) => ({
    key: t.key,
    label: t.label,
    path: t.path,
    views: counts.views[t.path] ?? 0,
    used: counts.used[`rekentool:${t.key}`] ?? 0,
    leads: t.leads ? (counts.leads[t.path] ?? 0) : null,
  }));
}

export async function rekentoolInsights(period: Period): Promise<RekentoolRow[]> {
  const paths = REKENTOOLS.map((t) => t.path);
  const [views, used, leads] = await Promise.all([
    safe(
      () => prisma.analyticsEvent.groupBy({ by: ["path"], where: { type: "PAGEVIEW", path: { in: paths }, createdAt: { gte: period.from } }, _count: { _all: true } }),
      [],
    ),
    safe(
      () =>
        prisma.analyticsEvent.groupBy({
          by: ["label"],
          where: { type: "INTERACTION", label: { in: REKENTOOLS.map((t) => `rekentool:${t.key}`) }, createdAt: { gte: period.from } },
          _count: { _all: true },
        }),
      [],
    ),
    safe(() => prisma.salesLead.groupBy({ by: ["sourceUrl"], where: { source: "rekentool", createdAt: { gte: period.from } }, _count: { _all: true } }), []),
  ]);
  return rekentoolRows({
    views: Object.fromEntries(views.map((r) => [r.path, r._count._all])),
    used: Object.fromEntries(used.flatMap((r) => (r.label ? [[r.label, r._count._all]] : []))),
    leads: Object.fromEntries(leads.flatMap((r) => (r.sourceUrl ? [[r.sourceUrl, r._count._all]] : []))),
  });
}
