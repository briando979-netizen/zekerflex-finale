import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHead } from "@/components/admin/kit";
import { CollusionBoard } from "@/components/admin/CollusionBoard";
import { ClawbacksPanel } from "@/components/admin/ClawbacksPanel";

export const dynamic = "force-dynamic";

export default async function FraudePage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="Fraudesignalen zijn alleen voor platformbeheerders." />;
  }
  return (
    <div className="space-y-4">
      <PageHead
        title="Fraude & signalen"
        subtitle="Collusie- en witwasdetectie op paren van opdrachtgever en werknemer, en terugboekingen. Urenfraude-signalen staan per urenbriefje bij Verloning en Uren."
      />
      <div className="grid items-start gap-4 xl:grid-cols-2">
        <CollusionBoard />
        <ClawbacksPanel />
      </div>
    </div>
  );
}
