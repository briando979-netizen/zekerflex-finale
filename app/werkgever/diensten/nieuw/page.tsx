import Link from "next/link";
import { requirePrincipal, hasRole } from "@/lib/auth";
import { getOrgProfileExtra, klusBeeldVan, type OrgProfileExtra } from "@/lib/profile/store";
import { prisma } from "@/lib/prisma";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { SHIFT_TEMPLATES, MIN_SHIFT_RATE_CENTS } from "@/lib/shifts/create";
import { listPools } from "@/lib/pools/store";
import { leesEigenTest } from "@/lib/admin/eigen-test";
import { isEigenTestBedrijf } from "@/lib/admin/eigen-test-regel";
import { PaginaKop } from "@/components/werkgever/PaginaKop";
import { NewShiftForm } from "@/components/app/NewShiftForm";
import { SnelPlaatsen } from "@/components/werkgever/SnelPlaatsen";
import { EersteVestiging } from "@/components/werkgever/EersteVestiging";
import { SNEL_EN, SNEL_NL } from "@/components/werkgever/snel-teksten";
import { getDict, getLocale } from "@/lib/i18n/server";
import { alleenFlexwerkAan } from "@/lib/seo/verbergen";
import { amsterdamClock } from "@/lib/time/amsterdam";
import { werklocatieKeuzes } from "@/lib/geo/vestiging-buitenland";

export const dynamic = "force-dynamic";

export default async function NieuweDienstPage({ searchParams }: { searchParams: Promise<{ kopie?: string | string[]; snel?: string | string[] }> }) {
  const d = await getDict();
  const n = d.newShift;
  const principal = await requirePrincipal();
  const scope = await resolveEmployerScope(principal);
  // ?kopie=<klus>: "Klus dupliceren" (naar YoungOnes) — dezelfde klus als vertrekpunt, alleen de datum is nieuw
  const sp = await searchParams;
  const kopieId = Array.isArray(sp.kopie) ? sp.kopie[0] : sp.kopie;
  const snelParam = Array.isArray(sp.snel) ? sp.snel[0] : sp.snel;
  const kopie = kopieId
    ? await prisma.shift.findFirst({
        where: { AND: [{ id: kopieId }, { branch: scope.branchIds ? { id: { in: scope.branchIds } } : { tenantId: { in: scope.tenantIds } } }] },
        select: { title: true, description: true, dresscode: true, startsAt: true, endsAt: true, positions: true, hourlyRateCents: true, branchId: true, annuleerUren: true, branch: { select: { tenantId: true } } },
      })
    : null;
  // een eigen-testbedrijf (lib/admin/eigen-test-regel.ts) houdt de pool van het origineel: de kopie gaat niet naar de open markt
  const kopiePoolId =
    kopieId && kopie && isEigenTestBedrijf(await leesEigenTest(), kopie.branch.tenantId)
      ? (await prisma.shiftPoolInvite.findFirst({ where: { shiftId: kopieId }, select: { poolId: true } }))?.poolId
      : undefined;
  const voorinvulling = kopie
    ? {
        ...(kopiePoolId ? { poolId: kopiePoolId } : {}),
        titel: kopie.title,
        van: amsterdamClock(kopie.startsAt),
        tot: amsterdamClock(kopie.endsAt),
        personen: kopie.positions,
        tariefCents: kopie.hourlyRateCents,
        branchId: kopie.branchId,
        annuleerUren: kopie.annuleerUren,
        omschrijving: kopie.description ?? "",
        dresscode: kopie.dresscode ?? "",
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
  const [pools, extra, alleenFlexwerk, locale, landen] = await Promise.all([
    tenantId ? listPools(tenantId) : Promise.resolve([]),
    tenantId ? getOrgProfileExtra(tenantId).catch((): OrgProfileExtra => ({})) : Promise.resolve<OrgProfileExtra>({}),
    // vlag `publiek-alleen-flexwerk` (20 nov): daarmee is er ook de korte weg in drie stappen (SnelPlaatsen), via een link
    alleenFlexwerkAan().catch(() => false),
    getLocale(),
    // vlaggen `werk-in-belgie` en `werk-in-buitenland` (standaard uit): het eerste adres en een eenmalige locatie mogen ook
    // buiten Nederland liggen; de landnamen in de taal van de pagina
    getLocale().then((taal) => werklocatieKeuzes(principal, taal)),
  ]);
  // 22 nov: het uitgebreide formulier (twee stappen, alle opties) is de standaard; "Snel een klus plaatsen" alleen via ?snel=1
  const snelModus = alleenFlexwerk && snelParam === "1";
  const kopieQuery = kopieId ? `kopie=${encodeURIComponent(kopieId)}` : "";
  const beeld = tenantId ? klusBeeldVan(tenantId, extra) : { logoUrl: null, useLogo: false };
  // kostenplaatsen/PO-nummers van het bedrijf (Facturen → factuurgegevens): keuze bij het plaatsen
  const kostenplaatsen = (extra.costCentres ?? []).map((k) => k.trim()).filter(Boolean);

  // het uitgebreide formulier volgt de breedte van de pagina; de stappenbalk staat boven de kaarten en elke sectie is een eigen
  // kaart (components/app/NewShiftForm.tsx), dus hier staat er geen kaart meer omheen (ronde 2, 23 nov 2026)
  const volledig = (
    <div>
      <NewShiftForm
        branches={branches}
        templates={SHIFT_TEMPLATES}
        minRateCents={MIN_SHIFT_RATE_CENTS}
        pools={pools.map((p) => ({ id: p.id, name: p.name, memberCount: p.members.length }))}
        beeld={{ ...beeld, canChange: hasRole(principal, "HQ_ADMIN", "PLATFORM_ADMIN") }}
        kostenplaatsen={kostenplaatsen}
        // het concept van /klus-plaatsen gaat naar het formulier dat open staat; in de snelle weg (?snel=1) neemt SnelPlaatsen het
        // concept, en bij "Klus dupliceren" is de gekozen klus het vertrekpunt
        leesConcept={!snelModus && !voorinvulling}
        landen={landen}
        {...(voorinvulling ? { voorinvulling } : {})}
      />
    </div>
  );

  return (
    // de korte weg en het eerste adres zijn smalle formulieren: die houden hun breedte (links uitgelijnd, zoals de rest van de app)
    <div className={snelModus || branches.length === 0 ? "max-w-5xl" : undefined}>
      <PaginaKop
        title={n.title}
        eyebrow={n.eyebrow}
        // de korte weg (?snel=1) zonder "Kies een functie of vul het zelf in": dat hoort bij de kiezer van het uitgebreide formulier
        subtitle={snelModus ? n.subtitleSnel : n.subtitle}
        action={
          <Link href="/werkgever/diensten" className="btn-ghost">
            {n.back}
          </Link>
        }
      />

      {branches.length === 0 ? (
        // zonder vestiging kan er geen klus uit (12 nov: hier liep het dood). Sinds 22 nov vult een beheerder het adres
        // meteen hier in (EersteVestiging, zelfde poort als POST /api/werkgever/branches); daarna staat het klusformulier er.
        // Een ander leest wie hij moet vragen.
        hasRole(principal, "HQ_ADMIN", "PLATFORM_ADMIN") ? (
          <EersteVestiging landen={landen} />
        ) : (
          <div className="card border-warn/30 bg-warn/5 p-5 text-sm text-neutralx-700">
            <p>{n.noBranches}</p>
            <p className="mt-2">{n.askAdmin}</p>
          </div>
        )
      ) : snelModus ? (
        <>
          <p className="mb-4 text-sm">
            <Link href={kopieQuery ? `/werkgever/diensten/nieuw?${kopieQuery}` : "/werkgever/diensten/nieuw"} className="inline-flex min-h-[44px] items-center font-semibold text-brand-600 hover:underline">
              ← {d.werkgeverStart.alleOpties}
            </Link>
          </p>
          <SnelPlaatsen
            branches={branches}
            sjablonen={SHIFT_TEMPLATES.map((s) => ({ key: s.key, label: s.label, hourlyRateCents: s.hourlyRateCents, description: s.description, dresscode: s.dresscode }))}
            minRateCents={MIN_SHIFT_RATE_CENTS}
            t={locale === "en" ? SNEL_EN : SNEL_NL}
            locale={locale === "en" ? "en" : "nl"}
            kostenplaatsen={kostenplaatsen}
            {...(voorinvulling ? { voorinvulling } : {})}
          />
        </>
      ) : (
        <>
          {alleenFlexwerk && (
            <p className="mb-2 text-sm">
              <Link href={`/werkgever/diensten/nieuw?snel=1${kopieQuery ? `&${kopieQuery}` : ""}`} className="inline-flex min-h-[44px] items-center font-semibold text-brand-600 hover:underline">
                {n.snelLink}
              </Link>
            </p>
          )}
          {volledig}
        </>
      )}
    </div>
  );
}
