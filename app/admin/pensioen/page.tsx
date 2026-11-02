import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHead } from "@/components/admin/kit";
import { PensioenBoard } from "@/components/admin/PensioenBoard";

export const dynamic = "force-dynamic";

export default async function PensioenPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="De pensioenaangifte is alleen voor platformbeheerders." />;
  }
  return (
    <div className="space-y-4">
      <PageHead
        title="Pensioenaangifte"
        subtitle="De maandelijkse UPA-aangifte aan StiPP voor de uitzendkrachten: pensioengevend loon, uren, regeling en premies, automatisch opgebouwd uit de loonstroken."
      />
      <PensioenBoard />
    </div>
  );
}
