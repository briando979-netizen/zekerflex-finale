import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHead } from "@/components/admin/kit";
import { AutopilotBoard } from "@/components/admin/AutopilotBoard";

export const dynamic = "force-dynamic";

export default async function AutopilotPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="De autopilot is alleen voor platformbeheerders." />;
  }
  return (
    <div className="space-y-4">
      <PageHead
        title="Autopilot"
        subtitle="De AI houdt ZekerFlex zelf draaiende: herinneringen, onbezette klussen redden, uren goedkeuren waar opdrachtgevers dat toestaan, onderhoud en een dagrapport."
      />
      <AutopilotBoard />
    </div>
  );
}
