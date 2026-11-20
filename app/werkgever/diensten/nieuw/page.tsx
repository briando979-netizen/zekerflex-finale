import Link from "next/link";
import { requirePrincipal, hasRole } from "@/lib/auth";
import { getOrgProfileExtra, klusBeeldVan } from "@/lib/profile/store";
import { prisma } from "@/lib/prisma";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { SHIFT_TEMPLATES, MIN_SHIFT_RATE_CENTS } from "@/lib/shifts/create";
import { listPools } from "@/lib/pools/store";
import { PageHeader } from "@/components/app/ui";
import { NewShiftForm } from "@/components/app/NewShiftForm";
import { SNEL_EN, SNEL_NL, SnelPlaatsen } from "@/components/werkgever/SnelPlaatsen";
import { getDict, getLocale } from "@/lib/i18n/server";
import { alleenFlexwerkAan } from "@/lib/seo/verbergen";

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

  const tenantId = scope.tenantIds[0];
  const [pools, extra, alleenFlexwerk, locale] = await Promise.all([
    tenantId ? listPools(tenantId) : Promise.resolve([]),
    tenantId ? getOrgProfileExtra(tenantId).catch(() => ({})) : Promise.resolve({}),
    // vlag `publiek-alleen-flexwerk` (20 nov): eerst de korte weg in drie stappen, het uitgebreide formulier eronder
    alleenFlexwerkAan().catch(() => false),
    getLocale(),
  ]);
  const beeld = tenantId ? klusBeeldVan(tenantId, extra) : { logoUrl: null, useLogo: false };

  const volledig = (
    <div className="surface p-6">
      <NewShiftForm
        branches={branches}
        templates={SHIFT_TEMPLATES}
        minRateCents={MIN_SHIFT_RATE_CENTS}
        pools={pools.map((p) => ({ id: p.id, name: p.name, memberCount: p.members.length }))}
        beeld={{ ...beeld, canChange: hasRole(principal, "HQ_ADMIN", "PLATFORM_ADMIN") }}
      />
    </div>
  );

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
        // zonder vestiging kan er geen klus uit: dan meteen de weg naar de onboarding (12 nov: hier liep het dood)
        <div className="card border-warn/30 bg-warn/5 p-5 text-sm text-neutralx-700">
          <p>{n.noBranches}</p>
          <Link href="/werkgever" className="btn-primary mt-3 inline-flex px-4 py-2 text-sm">
            {n.toOnboarding} →
          </Link>
        </div>
      ) : alleenFlexwerk ? (
        <>
          <SnelPlaatsen
            branches={branches}
            sjablonen={SHIFT_TEMPLATES.map((s) => ({ key: s.key, label: s.label, hourlyRateCents: s.hourlyRateCents, description: s.description, dresscode: s.dresscode }))}
            minRateCents={MIN_SHIFT_RATE_CENTS}
            t={locale === "en" ? SNEL_EN : SNEL_NL}
          />
          {/* meer opties (meerdere dagen, eenmalige locatie, pools, dresscode, foto): het uitgebreide formulier, dichtgeklapt */}
          <details className="mt-6">
            <summary className="cursor-pointer text-sm font-semibold text-brand-600 hover:underline">
              {locale === "en" ? "All options (full form)" : "Alle opties (uitgebreid formulier)"}
            </summary>
            <div className="mt-4">{volledig}</div>
          </details>
        </>
      ) : (
        volledig
      )}
    </div>
  );
}
