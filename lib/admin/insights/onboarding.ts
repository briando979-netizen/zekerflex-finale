import { prisma } from "@/lib/prisma";
import { kvGetMany } from "@/lib/storage/kv";
import { kindOf } from "@/lib/admin/insights/people";
import { isTestAccount, type OnboardingRij } from "@/lib/admin/onboarding-model";
import { TENANT_APPROVAL_PREFIX, TENANT_BEWIJS_PREFIX, verificatieUitFeiten } from "@/lib/company/verified";
import { herinneringenVerstuurd } from "@/lib/onboarding/reminders";

// De cijfers achter Admin → Onboarding. Alleen ophalen; de regels staan in
// lib/admin/onboarding-model.ts. Alle definities van "klaar" komen van de server
// (zie de kop van dat bestand).

const USER_LIMIT = 5000;

export interface OnboardingData {
  rijen: OnboardingRij[];
  /** Aantal accounts dat is weggelaten omdat het een testaccount is (0 als ze meetellen). */
  uitgesloten: number;
  /** Aantal geladen accounts en of er meer zijn dan de limiet. */
  afgekapt: boolean;
}

export async function onboardingData(opts: { testMeetellen: boolean; alleenId?: string }): Promise<OnboardingData> {
  const users = await prisma.user.findMany({
    ...(opts.alleenId ? { where: { id: opts.alleenId } } : {}),
    orderBy: { createdAt: "desc" },
    take: USER_LIMIT,
    select: {
      id: true,
      email: true,
      fullName: true,
      createdAt: true,
      lastLoginAt: true,
      emailVerifiedAt: true,
      kycStatus: true,
      disabledAt: true,
      memberships: { select: { role: true, tenantId: true, tenant: { select: { name: true } } } },
      freelancerProfile: {
        select: {
          homePostalCode: true,
          payoutIban: true,
          _count: { select: { assignments: true, matches: { where: { status: { in: ["VIEWED", "ACCEPTED", "AUTO_ASSIGNED"] } } } } },
        },
      },
    },
  });

  type Gebruiker = (typeof users)[number];
  const soortVan = (u: Gebruiker) => kindOf(u.memberships.map((m) => m.role));
  const werkgeverTenant = (u: Gebruiker) =>
    (u.memberships.find((m) => m.role === "HQ_ADMIN") ?? u.memberships.find((m) => m.role === "LOCAL_MANAGER") ?? u.memberships.find((m) => m.role === "DISPUTE_MANAGER"))?.tenantId ?? null;

  const meedoen = users.filter((u) => {
    const soort = soortVan(u);
    return soort === "flexwerker" || soort === "opdrachtgever";
  });
  const getest = (u: Gebruiker) =>
    isTestAccount({ email: u.email, rollen: u.memberships.map((m) => m.role), disabledAt: u.disabledAt, tenantNamen: u.memberships.map((m) => m.tenant.name) });
  // Beheerders en sales zitten niet in de lijst (soort "beheerder"), dus alleen de rest kan uitgesloten worden.
  const geteld = opts.testMeetellen ? meedoen : meedoen.filter((u) => !getest(u));

  const tenantIds = [...new Set(geteld.map((u) => (soortVan(u) === "opdrachtgever" ? werkgeverTenant(u) : null)).filter((t): t is string => Boolean(t)))];
  const werkerIds = geteld.filter((u) => soortVan(u) === "flexwerker").map((u) => u.id);

  const [tenants, ingepland, metKlus, fiscaal, herinneringen, goedkeuringen, bewijzen] = await Promise.all([
    prisma.tenant.findMany({
      where: { id: { in: tenantIds } },
      select: {
        id: true,
        name: true,
        type: true,
        companyRegistrationId: true,
        companyRegistration: { select: { isActive: true, insolvent: true } },
        _count: { select: { branches: true } },
      },
    }),
    prisma.tenant.findMany({ where: { id: { in: tenantIds }, branches: { some: { shifts: { some: { assignments: { some: {} } } } } } }, select: { id: true } }),
    prisma.tenant.findMany({ where: { id: { in: tenantIds }, branches: { some: { shifts: { some: {} } } } }, select: { id: true } }),
    kvGetMany<{ workerKind?: string | null; iban?: string | null }>(werkerIds.map((id) => `fiscal:${id}`)),
    kvGetMany<{ stage?: number; handmatig?: number }>(geteld.map((u) => `onboarding-reminder:${u.id}`)),
    kvGetMany<{ approved?: boolean }>(tenantIds.map((id) => `${TENANT_APPROVAL_PREFIX}${id}`)),
    kvGetMany<unknown>(tenantIds.map((id) => `${TENANT_BEWIJS_PREFIX}${id}`)),
  ]);

  const tenantVan = new Map(tenants.map((t) => [t.id, t]));
  const ingeplandSet = new Set(ingepland.map((t) => t.id));
  const klusSet = new Set(metKlus.map((t) => t.id));

  const rijen: OnboardingRij[] = geteld.map((u) => {
    const rollen = u.memberships.map((m) => m.role);
    const email = Boolean(u.emailVerifiedAt);
    const gedeeld = {
      id: u.id,
      naam: u.fullName,
      email: u.email,
      rollen,
      aangemeld: u.createdAt,
      laatsteInlog: u.lastLoginAt,
      herinneringen: herinneringenVerstuurd(herinneringen.get(`onboarding-reminder:${u.id}`)),
    };

    if (soortVan(u) === "flexwerker") {
      const fisc = fiscaal.get(`fiscal:${u.id}`);
      const profiel = u.freelancerProfile;
      const reageerde = Boolean(profiel && (profiel._count.assignments > 0 || profiel._count.matches > 0));
      return {
        ...gedeeld,
        doelgroep: "werker",
        tenantId: null,
        tenantNaam: null,
        gehaald: [
          true,
          email,
          Boolean(fisc?.workerKind),
          Boolean((profiel?.payoutIban || fisc?.iban) && profiel?.homePostalCode),
          u.kycStatus === "VERIFIED",
          reageerde,
        ],
      };
    }

    const tenantId = werkgeverTenant(u);
    const tenant = tenantId ? tenantVan.get(tenantId) : undefined;
    const kvkActief = Boolean(tenant?.companyRegistration?.isActive && !tenant.companyRegistration.insolvent);
    const geverifieerd = tenant
      ? verificatieUitFeiten({
          platform: tenant.type === "PLATFORM",
          kvkActief,
          kvkBewijs: kvkActief && bewijzen.has(`${TENANT_BEWIJS_PREFIX}${tenant.id}`),
          goedgekeurd: Boolean(goedkeuringen.get(`${TENANT_APPROVAL_PREFIX}${tenant.id}`)?.approved),
          ingepland: ingeplandSet.has(tenant.id),
        }).verified
      : false;
    return {
      ...gedeeld,
      doelgroep: "werkgever",
      tenantId,
      tenantNaam: tenant?.name ?? null,
      gehaald: [true, email, Boolean(tenant?.companyRegistrationId), (tenant?._count.branches ?? 0) > 0, geverifieerd, tenantId ? klusSet.has(tenantId) : false],
    };
  });

  return { rijen, uitgesloten: meedoen.length - geteld.length, afgekapt: users.length >= USER_LIMIT };
}
