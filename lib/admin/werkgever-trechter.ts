import { prisma } from "@/lib/prisma";
import { kvGetMany } from "@/lib/storage/kv";
import { isTestAccount } from "@/lib/admin/onboarding-model";
import { leesEigenTest } from "@/lib/admin/eigen-test";
import { TENANT_APPROVAL_PREFIX, TENANT_BEWIJS_PREFIX, verificatieUitFeiten } from "@/lib/company/verified";
import { WERKGEVER_PAGINAS, type BedrijfFeiten, type BezoekRij } from "@/lib/admin/werkgever-trechter-kern";

// ---------------------------------------------------------------------------
// De feiten achter Admin → Sales & groei → Werkgeverstrechter. Alleen ophalen en per bedrijf samenvatten; de telling
// staat in lib/admin/werkgever-trechter-kern.ts. Geen namen of e-mailadressen naar buiten: alleen ja/nee per stap.
// Geverifieerd rekent zoals Admin → Onboarding (lib/admin/insights/onboarding.ts) met verificatieUitFeiten.
// ---------------------------------------------------------------------------

const TENANT_LIMIET = 5000;
const BEZOEK_LIMIET = 100_000;
const DAG = 86_400_000;

export async function werkgeverTrechterData(nu: Date = new Date()): Promise<{ bedrijven: BedrijfFeiten[]; bezoek: BezoekRij[] }> {
  const tenants = await prisma.tenant.findMany({
    where: { type: { not: "PLATFORM" } },
    orderBy: { createdAt: "desc" },
    take: TENANT_LIMIET,
    select: {
      id: true,
      name: true,
      createdAt: true,
      companyRegistrationId: true,
      companyRegistration: { select: { isActive: true, insolvent: true } },
      memberships: { select: { user: { select: { id: true, email: true, disabledAt: true, memberships: { select: { role: true } } } } } },
      _count: { select: { branches: true } },
    },
  });
  const ids = tenants.map((t) => t.id);
  const sinds = new Date(nu.getTime() - 30 * DAG);

  const [klussen, goedkeuringen, bewijzen, bezoek] = await Promise.all([
    prisma.shift.findMany({
      where: { branch: { tenantId: { in: ids } } },
      select: { status: true, branch: { select: { tenantId: true } }, _count: { select: { assignments: true } } },
    }),
    kvGetMany<{ approved?: boolean }>(ids.map((id) => `${TENANT_APPROVAL_PREFIX}${id}`)),
    kvGetMany<unknown>(ids.map((id) => `${TENANT_BEWIJS_PREFIX}${id}`)),
    prisma.analyticsEvent.findMany({
      where: {
        createdAt: { gte: sinds, lte: nu },
        userId: null,
        type: { in: ["PAGEVIEW", "CLICK"] },
        OR: WERKGEVER_PAGINAS.flatMap((p) => [{ path: p }, { path: { startsWith: `${p}?` } }, { path: `${p}/` }]),
      },
      select: { type: true, path: true, sessionId: true, label: true, createdAt: true },
      take: BEZOEK_LIMIET,
    }),
  ]);

  const perTenant = new Map<string, { geplaatst: boolean; gepubliceerd: boolean; toewijzing: boolean }>();
  for (const k of klussen) {
    const t = perTenant.get(k.branch.tenantId) ?? { geplaatst: false, gepubliceerd: false, toewijzing: false };
    t.geplaatst = true;
    if (k.status !== "DRAFT") t.gepubliceerd = true;
    if (k._count.assignments > 0) t.toewijzing = true;
    perTenant.set(k.branch.tenantId, t);
  }

  // in het beheer gemarkeerd als eigen test (het bedrijf of het account): telt niet mee (lib/admin/eigen-test-kern.ts)
  const eigenTest = await leesEigenTest();
  const bedrijven: BedrijfFeiten[] = tenants.map((t) => {
    const echt =
      !Object.hasOwn(eigenTest.tenants, t.id) &&
      t.memberships.some(
        (m) =>
          !isTestAccount({
            email: m.user.email,
            rollen: m.user.memberships.map((x) => x.role),
            disabledAt: m.user.disabledAt,
            tenantNamen: [t.name],
            eigenTest: Object.hasOwn(eigenTest.users, m.user.id),
          }),
      );
    const kvkActief = Boolean(t.companyRegistration?.isActive && !t.companyRegistration.insolvent);
    const klus = perTenant.get(t.id);
    const geverifieerd = verificatieUitFeiten({
      platform: false,
      kvkActief,
      kvkBewijs: kvkActief && bewijzen.has(`${TENANT_BEWIJS_PREFIX}${t.id}`),
      goedgekeurd: Boolean(goedkeuringen.get(`${TENANT_APPROVAL_PREFIX}${t.id}`)?.approved),
      ingepland: Boolean(klus?.toewijzing),
    }).verified;
    return {
      aangemeld: t.createdAt,
      echt,
      kvk: Boolean(t.companyRegistrationId),
      geverifieerd,
      vestiging: t._count.branches > 0,
      klusGeplaatst: Boolean(klus?.geplaatst),
      klusGepubliceerd: Boolean(klus?.gepubliceerd),
      toewijzing: Boolean(klus?.toewijzing),
    };
  });

  return {
    bedrijven,
    bezoek: bezoek.map((e) => ({ type: e.type === "CLICK" ? "CLICK" : "PAGEVIEW", path: e.path, sessionId: e.sessionId, label: e.label, at: e.createdAt })),
  };
}
