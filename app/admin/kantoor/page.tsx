import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHead } from "@/components/admin/kit";
import { OfficeFloor } from "@/components/admin/OfficeFloor";
import { KantoorView } from "@/components/admin/KantoorView";

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
        subtitle="Het ZekerFlex-kantoor en de stad eromheen, live. Elk voertuig brengt een échte gebeurtenis van de laatste 24 uur naar het hoofdkantoor, waar een robot hem naar de juiste afdeling brengt. Klantpanden, de woonwijk, de bank en het magazijn draaien op echte cijfers."
      />
      <KantoorView />
      <OfficeFloor />
    </div>
  );
}
