import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHead } from "@/components/admin/kit";
import { AiTeamsConsole } from "@/components/admin/AiTeamsConsole";

export const dynamic = "force-dynamic";

export default async function AiTeamsPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="Alleen voor platformbeheerders." />;
  }
  return (
    <div className="space-y-4">
      <PageHead title="AI-teams" subtitle="Teams die elke dag zelfstandig werken aan groei, oplossingen, automatisering, stijl en rapportage. Alles wat ze doen staat live in het verslag." />
      <AiTeamsConsole />
    </div>
  );
}
