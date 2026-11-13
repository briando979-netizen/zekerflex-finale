import { prisma } from "@/lib/prisma";
import { retentionCutoff } from "@/lib/privacy/retention";

// ---------------------------------------------------------------------------
// Bezoekstatistiek (AnalyticsEvent: bekeken pagina's en klikken, zonder cookies) na 13 maanden weg (13 nov 2026, besluit
// 86 na de db-groei-ronde). Gemeten: 52.652 rijen sinds september, deze maand al 30.386, en nooit opgeruimd; een rij kan een
// userId hebben, dus het zijn persoonsgegevens. De termijn staat in lib/privacy/retention.ts ("bezoekstatistiek") en in
// /privacy (tests/bezoekstatistiek-bewaren.test.ts houdt die twee gelijk). Elke nacht mee met de sweep, begrensd per
// ronde en de oudste eerst; met dryRun alleen tellen.
// ---------------------------------------------------------------------------

/** Ruim onder de grens van Postgres voor één IN-lijst; nu komen er ±2.500 rijen per dag bij. */
export const BEZOEK_PER_RONDE = 20_000;

export async function ruimBezoekstatistiekOp(now: Date, dryRun: boolean, max = BEZOEK_PER_RONDE): Promise<number> {
  const grens = retentionCutoff("bezoekstatistiek", now);
  if (!grens) return 0;
  const where = { createdAt: { lt: grens } };
  if (dryRun) return prisma.analyticsEvent.count({ where });
  const ids = await prisma.analyticsEvent.findMany({ where, orderBy: { createdAt: "asc" }, take: Math.max(1, max), select: { id: true } });
  if (ids.length === 0) return 0;
  return (await prisma.analyticsEvent.deleteMany({ where: { id: { in: ids.map((r) => r.id) } } })).count;
}
