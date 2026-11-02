import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHead } from "@/components/admin/kit";
import { SpecialistsConsole } from "@/components/admin/SpecialistsConsole";

export const dynamic = "force-dynamic";

export default async function SpecialistenPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="Alleen voor platformbeheerders." />;
  }
  return (
    <div className="space-y-4">
      <PageHead title="AI-specialisten" subtitle="Jurist, taxateur, belastingadviseur, boekhouder, marketeer, recruiter, data-analist en compliance. Antwoorden zijn concepten om zelf te controleren." />
      <SpecialistsConsole />
    </div>
  );
}
