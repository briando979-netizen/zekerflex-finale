import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHeader } from "@/components/app/ui";
import { OfficeFloor } from "@/components/admin/OfficeFloor";
import { OfficeSim } from "@/components/admin/OfficeSim";

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
        subtitle="Het ZekerFlex-kantoor waar AI-robotjes werken. Elke robot die door de gang loopt brengt een échte gebeurtenis van de laatste 24 uur naar de afdeling die hem afhandelde."
      />
      <OfficeSim />
      <h2 className="pt-4 font-display text-lg font-bold">Afdelingscijfers</h2>
      <OfficeFloor />
    </div>
  );
}
