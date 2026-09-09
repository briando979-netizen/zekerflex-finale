import Link from "next/link";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { SHIFT_TEMPLATES, MIN_SHIFT_RATE_CENTS } from "@/lib/shifts/create";
import { PageHeader } from "@/components/app/ui";
import { NewShiftForm } from "@/components/app/NewShiftForm";
import { getDict } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function NieuweDienstPage() {
  const n = (await getDict()).newShift;
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
        title={n.title}
        eyebrow={n.eyebrow}
        subtitle={n.subtitle}
        action={
          <Link href="/werkgever/diensten" className="btn-ghost">
            {n.back}
          </Link>
        }
      />

      {branches.length === 0 ? (
        <div className="card border-warn/30 bg-warn/5 p-5 text-sm text-neutralx-700">{n.noBranches}</div>
      ) : (
        <div className="surface p-6">
          <NewShiftForm branches={branches} templates={SHIFT_TEMPLATES} minRateCents={MIN_SHIFT_RATE_CENTS} />
        </div>
      )}
    </div>
  );
}
