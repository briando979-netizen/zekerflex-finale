import { getPrincipal, hasRole } from "@/lib/auth";
import { env } from "@/lib/env";
import { Notice, PageHead } from "@/components/admin/kit";
import { BuiltSitesPanel } from "@/components/admin/BuiltSitesPanel";
import { WebsiteBeheer } from "@/components/admin/WebsiteBeheer";
import { builtSitesOverview } from "@/lib/sites/admin-overview";

export const dynamic = "force-dynamic";

export default async function WebsiteBeheerPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="Website-beheer is alleen beschikbaar voor platformbeheerders." />;
  }
  // een storing in het overzicht mag de rest van de pagina niet meenemen
  const sites = await builtSitesOverview(env.APP_BASE_URL).catch(() => null);
  return (
    <div className="space-y-4">
      <WebsiteBeheer />
      {sites ? <BuiltSitesPanel sites={sites} /> : <Notice tone="warn">Het overzicht van gebouwde websites kon nu niet worden geladen. Probeer het straks opnieuw.</Notice>}
    </div>
  );
}
