import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHeader } from "@/components/app/ui";
import { SpecialistsConsole } from "@/components/admin/SpecialistsConsole";

export const dynamic = "force-dynamic";

export default async function SpecialistenPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHeader title="Geen toegang" subtitle="Alleen voor platformbeheerders." />;
  }
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="AI-specialisten" subtitle="Jurist, taxateur, belastingadviseur, boekhouder, marketeer, recruiter, data-analist en compliance — antwoorden zijn concepten om zelf te controleren." />
      <SpecialistsConsole />
    </div>
  );
}
