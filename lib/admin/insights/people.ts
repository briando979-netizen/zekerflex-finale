import { prisma } from "@/lib/prisma";
import { tenantVerification, type TenantVerifiedVia } from "@/lib/company/verified";
import { bucketCount, bucketSum, deltaPct, safe, timelineKeys, type Period } from "@/lib/admin/period";

// De cijfers achter Admin → Gebruikers en Admin → Bedrijven.

const LIST_LIMIT = 2000;

export type PersonKind = "flexwerker" | "opdrachtgever" | "beheerder" | "overig";

export function kindOf(roles: string[]): PersonKind {
  if (roles.includes("PLATFORM_ADMIN") || roles.includes("SALES")) return "beheerder";
  if (roles.includes("HQ_ADMIN") || roles.includes("LOCAL_MANAGER") || roles.includes("DISPUTE_MANAGER")) return "opdrachtgever";
  if (roles.includes("FREELANCER")) return "flexwerker";
  return "overig";
}

export async function usersInsights(period: Period) {
  const [users, withAssignment, withApprovedHours] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        kycStatus: true,
        disabledAt: true,
        lastLoginAt: true,
        emailVerifiedAt: true,
        createdAt: true,
        memberships: { select: { role: true, tenant: { select: { name: true, type: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: LIST_LIMIT,
    }),
    safe(() => prisma.freelancerProfile.count({ where: { assignments: { some: { cancelledAt: null } } } }), 0),
    safe(() => prisma.freelancerProfile.count({ where: { timesheets: { some: { status: { in: ["APPROVED", "PAID"] } } } } }), 0),
  ]);

  const rows = users.map((u) => ({ ...u, kind: kindOf(u.memberships.map((m) => m.role)) }));
  const flex = rows.filter((u) => u.kind === "flexwerker");
  const employers = rows.filter((u) => u.kind === "opdrachtgever");
  const newNow = rows.filter((u) => u.createdAt >= period.from);
  const newPrev = rows.filter((u) => u.createdAt >= period.prevFrom && u.createdAt < period.from);
  const active = rows.filter((u) => u.lastLoginAt && u.lastLoginAt >= period.from);
  const activePrev = rows.filter((u) => u.lastLoginAt && u.lastLoginAt >= period.prevFrom && u.lastLoginAt < period.from);
  const kyc = (status: string) => flex.filter((u) => u.kycStatus === status).length;

  return {
    rows,
    labels: timelineKeys(period),
    total: rows.length,
    capped: rows.length >= LIST_LIMIT,
    flexCount: flex.length,
    employerCount: employers.length,
    blocked: rows.filter((u) => u.disabledAt).length,
    newCount: newNow.length,
    newDelta: deltaPct(newNow.length, newPrev.length),
    active: active.length,
    activeDelta: deltaPct(active.length, activePrev.length),
    signupSeries: bucketCount(rows, (u) => u.createdAt, period),
    flexSeries: bucketCount(flex, (u) => u.createdAt, period),
    employerSeries: bucketCount(employers, (u) => u.createdAt, period),
    kycVerified: kyc("VERIFIED"),
    kyc: [
      { label: "Geverifieerd", value: kyc("VERIFIED"), tone: "trust" as const },
      { label: "In beoordeling", value: kyc("PENDING"), tone: "warn" as const },
      { label: "Niet gestart", value: kyc("NOT_STARTED"), tone: "neutral" as const },
      { label: "Afgewezen of verlopen", value: kyc("REJECTED") + kyc("EXPIRED"), tone: "crit" as const },
    ],
    funnel: [
      { label: "Account aangemaakt", value: flex.length },
      { label: "E-mail bevestigd", value: flex.filter((u) => u.emailVerifiedAt).length },
      { label: "Identiteit geverifieerd", value: kyc("VERIFIED") },
      { label: "Eerste klus", value: withAssignment },
      { label: "Uren goedgekeurd", value: withApprovedHours },
    ],
  };
}

export interface CompanyRow {
  id: string;
  name: string;
  kvkNumber: string | null;
  /** Land van het bedrijf (ISO) en het btw-nummer, voor bedrijven zonder KVK. */
  country: string;
  vatNumber: string | null;
  createdAt: Date;
  branches: number;
  members: number;
  verifiedVia: TenantVerifiedVia | null;
  shifts: number;
  billedCents: number;
  openCents: number;
}

export async function companiesInsights(period: Period) {
  const tenants = await prisma.tenant.findMany({
    where: { type: { not: "PLATFORM" } },
    select: {
      id: true,
      name: true,
      kvkNumber: true,
      country: true,
      vatNumber: true,
      createdAt: true,
      branches: { select: { id: true } },
      _count: { select: { memberships: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  const branchOwner = new Map(tenants.flatMap((t) => t.branches.map((b) => [b.id, t.id] as const)));

  const [invoices, openInvoices, shifts, verifications] = await Promise.all([
    safe(() => prisma.invoice.findMany({ where: { recipientTenantId: { not: null }, status: { in: ["PAID", "ISSUED"] }, createdAt: { gte: period.prevFrom } }, select: { recipientTenantId: true, totalCents: true, createdAt: true }, take: 50_000 }), []),
    safe(() => prisma.invoice.groupBy({ by: ["recipientTenantId"], where: { status: "ISSUED", recipientTenantId: { not: null } }, _sum: { totalCents: true } }), []),
    safe(() => prisma.shift.findMany({ where: { startsAt: { gte: period.prevFrom, lt: period.to }, status: { not: "CANCELLED" } }, select: { branchId: true, startsAt: true }, take: 50_000 }), []),
    Promise.all(tenants.map((t) => tenantVerification(t.id).catch(() => ({ verified: false, via: null })))),
  ]);

  const shiftsNow = shifts.filter((s) => s.startsAt >= period.from);
  const billedNow = invoices.filter((i) => i.createdAt >= period.from);
  const billedPrev = invoices.filter((i) => i.createdAt < period.from);
  const sum = (rows: { totalCents: number }[]) => rows.reduce((s, r) => s + r.totalCents, 0);

  const rows: CompanyRow[] = tenants.map((t, i) => ({
    id: t.id,
    name: t.name,
    kvkNumber: t.kvkNumber,
    country: t.country,
    vatNumber: t.vatNumber,
    createdAt: t.createdAt,
    branches: t.branches.length,
    members: t._count.memberships,
    verifiedVia: verifications[i]?.via ?? null,
    shifts: shiftsNow.filter((s) => branchOwner.get(s.branchId) === t.id).length,
    billedCents: sum(billedNow.filter((inv) => inv.recipientTenantId === t.id)),
    openCents: openInvoices.find((o) => o.recipientTenantId === t.id)?._sum.totalCents ?? 0,
  }));

  const newNow = tenants.filter((t) => t.createdAt >= period.from).length;
  const newPrev = tenants.filter((t) => t.createdAt >= period.prevFrom && t.createdAt < period.from).length;
  const shiftsPrev = shifts.length - shiftsNow.length;

  return {
    rows,
    labels: timelineKeys(period),
    total: rows.length,
    verified: rows.filter((r) => r.verifiedVia).length,
    active: rows.filter((r) => r.shifts > 0).length,
    newCount: newNow,
    newDelta: deltaPct(newNow, newPrev),
    shifts: shiftsNow.length,
    shiftsDelta: deltaPct(shiftsNow.length, shiftsPrev),
    shiftSeries: bucketCount(shiftsNow, (s) => s.startsAt, period),
    billed: sum(billedNow),
    billedDelta: deltaPct(sum(billedNow), sum(billedPrev)),
    billedSeries: bucketSum(billedNow, (i) => i.createdAt, (i) => i.totalCents, period),
    open: rows.reduce((s, r) => s + r.openCents, 0),
    verification: [
      { label: "Geverifieerd via KVK", value: rows.filter((r) => r.verifiedVia === "kvk").length, tone: "trust" as const },
      { label: "Handmatig goedgekeurd", value: rows.filter((r) => r.verifiedVia === "admin").length, tone: "ok" as const },
      { label: "Bestaande klant", value: rows.filter((r) => r.verifiedVia === "history").length, tone: "plan" as const },
      { label: "Nog niet geverifieerd", value: rows.filter((r) => !r.verifiedVia).length, tone: "warn" as const },
    ],
  };
}
