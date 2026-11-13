import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHead } from "@/components/admin/kit";
import { KostenBeheer } from "@/components/admin/KostenBeheer";
import { leesKosten, operationeleKosten } from "@/lib/admin/kosten-opslag";
import { transipFacturen } from "@/lib/admin/kosten-transip";

export const dynamic = "force-dynamic";

export default async function AdminKostenPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="Kosten zijn alleen beschikbaar voor platformbeheerders." />;
  }
  const [stand, transip, financien] = await Promise.all([leesKosten(), transipFacturen(), operationeleKosten()]);
  return <KostenBeheer initieel={stand} transip={transip} financien={financien} />;
}
