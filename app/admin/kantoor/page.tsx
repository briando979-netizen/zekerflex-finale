import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHeader } from "@/components/app/ui";
import { OfficeFloor } from "@/components/admin/OfficeFloor";

export const dynamic = "force-dynamic";

export default async function KantoorPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHeader title="Geen toegang" subtitle="Het live kantoor is alleen voor platformbeheerders." />;
  }
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Live kantoor"
        subtitle="Een speelse plattegrond van wat er nu gebeurt — de cijfers op elke kamer komen rechtstreeks uit de shop-, mail-, nieuwsbrief- en sales-data; de robotjes zijn illustratief."
      />
      <OfficeFloor />
    </div>
  );
}
