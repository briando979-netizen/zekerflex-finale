import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { publicOpenShifts } from "@/lib/public-shifts";
import type { Page, SiteVacancy } from "@/lib/sites/types";

// ---------------------------------------------------------------------------
// The "Vacatures" block of a company's own website: its open shifts on
// ZekerFlex, the same ones the public /klussen pages show (public, not started,
// still taking reactions), loaded when a visitor opens the page. Each links to
// the shift's page on ZekerFlex, where people react.
// ---------------------------------------------------------------------------

/** How many shifts a page asks for (its largest vacatures block), or 0 when it has none. */
export function vacancyCount(page: Pick<Page, "blocks">): number {
  return page.blocks.reduce((n, b) => (b.type === "vacatures" ? Math.max(n, Math.min(12, b.props.aantal)) : n), 0);
}

export async function siteVacancies(tenantId: string, take: number): Promise<SiteVacancy[]> {
  const base = env.APP_BASE_URL.replace(/\/+$/, "");
  try {
    const shifts = await publicOpenShifts({ tenantId, take });
    return shifts.map((s) => ({ id: s.id, titel: s.title, start: s.startsAt.toISOString(), eind: s.endsAt.toISOString(), plaats: s.city, uurloonCents: s.hourlyRateCents, url: `${base}/klussen/${s.id}` }));
  } catch (err) {
    logger.warn("site vacancies failed", { tenantId, err: String(err) });
    return [];
  }
}
