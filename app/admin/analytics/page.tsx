import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHead } from "@/components/admin/kit";
import { TrafficDashboard } from "@/components/analytics/TrafficDashboard";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="Het verkeersdashboard is alleen beschikbaar voor platformbeheerders." />;
  }
  return <TrafficDashboard />;
}
