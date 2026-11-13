import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHead } from "@/components/admin/kit";
import { KostenBeheer } from "@/components/admin/KostenBeheer";
import { leesKosten } from "@/lib/admin/kosten-opslag";
import { transipFacturen } from "@/lib/admin/kosten-transip";
import { getFinanceSettings } from "@/lib/admin/finance-settings";

export const dynamic = "force-dynamic";

export default async function AdminKostenPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="Kosten zijn alleen beschikbaar voor platformbeheerders." />;
  }
  const [stand, transip, financien] = await Promise.all([leesKosten(), transipFacturen(), getFinanceSettings().catch(() => null)]);
  return <KostenBeheer initieel={stand} transip={transip} financienMaandCent={financien?.operationalMonthlyCents ?? 0} />;
}
