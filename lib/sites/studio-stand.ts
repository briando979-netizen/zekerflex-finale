import { getPrincipal, hasRole } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { WERKRUIMTES } from "@/lib/werkgever/werkruimte";
import { werkruimteVan } from "@/lib/werkgever/werkruimte-server";
import type { DashboardStand } from "@/components/app/werkruimte/DashboardWisselaar";
import type { SiteSoort } from "@/lib/sites/types";

/**
 * De dashboard-wisselaar in de studio (components/studio/StudioShell.tsx). Open is het dashboard van
 * de studio waarin je bent: hier beslist het adres, niet het cookie. Dat dashboard staat ook in de
 * lijst als het bedrijf de studio voor het eerst opent. Zonder sessie of bij een storing: geen
 * wisselaar (null); de studio werkt dan gewoon door.
 */
export interface StudioStand extends DashboardStand {
  /** de browser had dit dashboard al open (cookie); anders zet de studio het alsnog (StudioShell) */
  cookieGoed: boolean;
}

export async function studioStand(soort: SiteSoort): Promise<StudioStand | null> {
  try {
    const principal = await getPrincipal();
    if (!principal) return null;
    const scope = await resolveEmployerScope(principal);
    const w = await werkruimteVan(scope.tenantIds[0]);
    return {
      actief: soort,
      dashboards: WERKRUIMTES.filter((d) => d === soort || w.dashboards.includes(d)),
      kanToevoegen: hasRole(principal, "HQ_ADMIN", "PLATFORM_ADMIN"),
      cookieGoed: w.soort === soort,
    };
  } catch {
    return null;
  }
}
