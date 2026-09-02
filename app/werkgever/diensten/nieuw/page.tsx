import Link from "next/link";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { SHIFT_TEMPLATES } from "@/lib/shifts/create";
import { PageHeader } from "@/components/app/ui";
import { NewShiftForm } from "@/components/app/NewShiftForm";

export const dynamic = "force-dynamic";

export default async function NieuweDienstPage() {
  const principal = await requirePrincipal();
  const scope = await resolveEmployerScope(principal);

  const branches = await prisma.branch.findMany({
    where: scope.branchIds
      ? { id: { in: scope.branchIds } }
      : { tenantId: { in: scope.tenantIds } },
    select: { id: true, name: true, city: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Dienst uitzetten"
        eyebrow="Nieuw"
        subtitle="Kies een sjabloon of vul het zelf in. Zet 'm op meerdere dagen en ZekerFlex matcht direct de beste kandidaten."
        action={
          <Link href="/werkgever/diensten" className="btn-ghost">
            Terug
          </Link>
        }
      />

      {branches.length === 0 ? (
        <div className="card border-warn/30 bg-warn/5 p-5 text-sm text-neutralx-700">
          Er zijn nog geen vestigingen aan je organisatie gekoppeld. Rond eerst de onboarding af.
        </div>
      ) : (
        <div className="surface p-6">
          <NewShiftForm branches={branches} templates={SHIFT_TEMPLATES} />
        </div>
      )}
    </div>
  );
}
