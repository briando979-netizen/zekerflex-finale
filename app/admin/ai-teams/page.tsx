import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHeader } from "@/components/app/ui";
import { AiTeamsConsole } from "@/components/admin/AiTeamsConsole";

export const dynamic = "force-dynamic";

export default async function AiTeamsPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHeader title="Geen toegang" subtitle="Alleen voor platformbeheerders." />;
  }
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="AI-teams" subtitle="Teams die elke dag zelfstandig werken aan groei, oplossingen, automatisering, stijl en rapportage — alles wat ze doen staat live in het verslag." />
      <AiTeamsConsole />
    </div>
  );
}
