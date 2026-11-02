import { prisma } from "@/lib/prisma";
import { bucketCount, safe, timelineKeys, type Period } from "@/lib/admin/period";

// De cijfers boven de sales-pijplijn: waar de leads staan, waar ze vandaan komen en hoe
// ze doorstromen. Telt alle leads, niet alleen de 200 die het bord laat zien.

const OPEN = ["NEW", "ENRICHED", "QUEUED", "DRAFTED", "APPROVED", "SENT"] as const;
const CONTACTED = ["SENT", "REPLIED", "WON", "LOST", "BOUNCED", "UNSUBSCRIBED"] as const;

const SOURCE_LABEL: Record<string, string> = {
  manual: "Handmatig",
  kvkbase: "KVK",
  careers: "Vacaturesites",
  import: "Import",
  "field-visit": "Buitendienst",
  "demo-request": "Demo-aanvraag",
  uitzendbureau: "Uitzendbureau-aanvraag",
  google: "Google Maps",
  "ai-beller": "AI-beller",
  website: "Website",
  offerte: "Offerte-AI",
  "offerte-inbound": "Offerte-AI",
  "website-check": "Website-check",
};

export async function salesInsights(period: Period) {
  const [byStatus, bySource, total, contacted, replied, won, recent] = await Promise.all([
    safe(() => prisma.salesLead.groupBy({ by: ["status"], _count: { _all: true } }), []),
    safe(() => prisma.salesLead.groupBy({ by: ["source"], _count: { _all: true } }), []),
    safe(() => prisma.salesLead.count(), 0),
    safe(() => prisma.salesLead.count({ where: { OR: [{ lastContactedAt: { not: null } }, { status: { in: [...CONTACTED] } }] } }), 0),
    safe(() => prisma.salesLead.count({ where: { OR: [{ repliedAt: { not: null } }, { status: { in: ["REPLIED", "WON"] } }] } }), 0),
    safe(() => prisma.salesLead.count({ where: { status: "WON" } }), 0),
    safe(() => prisma.salesLead.findMany({ where: { createdAt: { gte: period.from } }, select: { createdAt: true }, take: 20_000 }), []),
  ]);
  const statusCount = (statuses: readonly string[]) => byStatus.filter((s) => statuses.includes(s.status)).reduce((n, s) => n + s._count._all, 0);
  return {
    labels: timelineKeys(period),
    newSeries: bucketCount(recent, (l) => l.createdAt, period),
    newCount: recent.length,
    total,
    open: statusCount(OPEN),
    talking: statusCount(["REPLIED"]),
    won,
    lost: statusCount(["LOST", "DISQUALIFIED", "BOUNCED", "UNSUBSCRIBED"]),
    funnel: [
      { label: "Leads", value: total },
      { label: "Benaderd", value: contacted },
      { label: "Gereageerd", value: replied },
      { label: "Gewonnen", value: won },
    ],
    sources: bySource
      .map((s) => ({ key: s.source, label: SOURCE_LABEL[s.source] ?? s.source, value: s._count._all }))
      .sort((a, b) => b.value - a.value),
  };
}
