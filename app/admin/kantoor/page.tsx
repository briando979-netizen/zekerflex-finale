import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHead } from "@/components/admin/kit";
import { OfficeFloor } from "@/components/admin/OfficeFloor";
import { OfficeSim } from "@/components/admin/OfficeSim";

export const dynamic = "force-dynamic";

export default async function KantoorPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="Het live kantoor is alleen voor platformbeheerders." />;
  }
  return (
    <div className="space-y-4">
      <PageHead
        title="Live kantoor"
        subtitle="Het ZekerFlex-kantoor waar AI-robotjes werken. Elke robot in de gang brengt een échte gebeurtenis van de laatste 24 uur naar de afdeling die hem afhandelde."
      />
      <OfficeSim />
      <OfficeFloor />
    </div>
  );
}
