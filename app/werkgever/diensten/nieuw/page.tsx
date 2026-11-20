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
import { amsterdamClock } from "@/lib/time/amsterdam";

export const dynamic = "force-dynamic";

export default async function NieuweDienstPage({ searchParams }: { searchParams: Promise<{ kopie?: string | string[] }> }) {
  const d = await getDict();
  const n = d.newShift;
  const principal = await requirePrincipal();
  const scope = await resolveEmployerScope(principal);
  // ?kopie=<klus>: "Klus dupliceren" (naar YoungOnes) — dezelfde klus als vertrekpunt, alleen de datum is nieuw
  const sp = await searchParams;
  const kopieId = Array.isArray(sp.kopie) ? sp.kopie[0] : sp.kopie;
  const kopie = kopieId
    ? await prisma.shift.findFirst({
        where: { AND: [{ id: kopieId }, { branch: scope.branchIds ? { id: { in: scope.branchIds } } : { tenantId: { in: scope.tenantIds } } }] },
        select: { title: true, startsAt: true, endsAt: true, positions: true, hourlyRateCents: true, branchId: true, annuleerUren: true },
      })
    : null;
  const voorinvulling = kopie
    ? {
        titel: kopie.title,
        van: amsterdamClock(kopie.startsAt),
        tot: amsterdamClock(kopie.endsAt),
        personen: kopie.positions,
        tariefCents: kopie.hourlyRateCents,
        branchId: kopie.branchId,
        annuleerUren: kopie.annuleerUren,
      }
    : undefined;

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
        // zonder vestiging kan er geen klus uit (12 nov: hier liep het dood). Het adres komt erbij op Locaties; dat
        // mag alleen een beheerder (zelfde poort als POST /api/werkgever/branches), een ander leest wie hij moet vragen.
        <div className="card border-warn/30 bg-warn/5 p-5 text-sm text-neutralx-700">
          <p>{n.noBranches}</p>
          {hasRole(principal, "HQ_ADMIN", "PLATFORM_ADMIN") ? (
            <Link href="/werkgever/locaties" className="btn-primary mt-3 inline-flex px-4 py-2 text-sm">
              {n.addAddress} →
            </Link>
          ) : (
            <p className="mt-2">{n.askAdmin}</p>
          )}
        </div>
      ) : alleenFlexwerk ? (
        <>
          <SnelPlaatsen
            branches={branches}
            sjablonen={SHIFT_TEMPLATES.map((s) => ({ key: s.key, label: s.label, hourlyRateCents: s.hourlyRateCents, description: s.description, dresscode: s.dresscode }))}
            minRateCents={MIN_SHIFT_RATE_CENTS}
            t={locale === "en" ? SNEL_EN : SNEL_NL}
            locale={locale === "en" ? "en" : "nl"}
            {...(voorinvulling ? { voorinvulling } : {})}
          />
          {/* meer opties (meerdere dagen, eenmalige locatie, pools, dresscode, foto): het uitgebreide formulier, dichtgeklapt */}
          <details className="mt-6">
            <summary className="cursor-pointer text-sm font-semibold text-brand-600 hover:underline">
              {d.werkgeverStart.alleOpties}
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
