import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHeader } from "@/components/app/ui";
import { CollusionBoard } from "@/components/admin/CollusionBoard";

export const dynamic = "force-dynamic";

export default async function FraudePage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return (
      <div className="mx-auto max-w-4xl">
        <PageHeader title="Geen toegang" subtitle="Fraudesignalen zijn alleen voor platformbeheerders." />
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Fraude & signalen" subtitle="Collusie-/witwasdetectie op opdrachtgever↔werknemer-paren. Urenfraude-signalen staan per urenbriefje bij Verloning/Uren." />
      <CollusionBoard />
    </div>
  );
}
