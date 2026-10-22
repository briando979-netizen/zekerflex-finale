import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHeader } from "@/components/app/ui";
import { AutopilotBoard } from "@/components/admin/AutopilotBoard";

export const dynamic = "force-dynamic";

export default async function AutopilotPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return (
      <div className="mx-auto max-w-4xl">
        <PageHeader title="Geen toegang" subtitle="De autopilot is alleen voor platformbeheerders." />
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Autopilot"
        subtitle="De AI houdt ZekerFlex zelf draaiende: herinneringen, onbezette klussen redden, uren goedkeuren waar opdrachtgevers dat toestaan, onderhoud en een dagrapport."
      />
      <AutopilotBoard />
    </div>
  );
}
