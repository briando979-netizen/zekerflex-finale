import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHeader } from "@/components/app/ui";
import { PensioenBoard } from "@/components/admin/PensioenBoard";

export const dynamic = "force-dynamic";

export default async function PensioenPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return (
      <div className="mx-auto max-w-4xl">
        <PageHeader title="Geen toegang" subtitle="De pensioenaangifte is alleen voor platformbeheerders." />
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Pensioenaangifte (StiPP)"
        subtitle="Maandelijkse UPA-aangifte voor de uitzendkrachten: pensioengevend loon, uren, regeling en premies, automatisch opgebouwd uit de loonstroken en geleverd aan de pensioenuitvoerder."
      />
      <PensioenBoard />
    </div>
  );
}
