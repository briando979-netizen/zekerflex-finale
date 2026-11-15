import { prisma } from "@/lib/prisma";
import { safe } from "@/lib/admin/period";
import { leesEigenTest } from "@/lib/admin/eigen-test";
import type { EigenTest } from "@/lib/admin/eigen-test-kern";
import { isEigenTestKlus } from "@/lib/admin/eigen-test-kern";
import { isEchtBedrijf, isEchteAanmelding } from "@/lib/admin/echt-kern";
import { isTestAccount } from "@/lib/admin/onboarding-model";
import { isTestklus } from "@/lib/shifts/testklus";
import { perWeek, weekCijfers as maakWeekCijfers, weken, type WeekCijfers } from "@/lib/admin/weekcijfers-kern";

// De feiten achter "De week in vijf getallen" (lib/admin/weekcijfers-kern.ts rekent). Elk getal mag apart mislukken
// (safe): dan staat er 0 en blijft de pagina heel. Alleen aantallen en bedragen, geen namen of adressen.

const LIMIET = 50_000;

/** De id's van de echte bedrijven (isEchtBedrijf): voor klussen, uren en facturen. */
export async function echteBedrijfIds(eigenTest: EigenTest | null): Promise<Set<string>> {
  const tenants = await prisma.tenant.findMany({
    where: { type: { not: "PLATFORM" } },
    take: 5000,
    select: { id: true, name: true, memberships: { select: { user: { select: { id: true, email: true, disabledAt: true, memberships: { select: { role: true } } } } } } },
  });
  return new Set(
    tenants
      .filter((t) =>
        isEchtBedrijf(
          { id: t.id, name: t.name, leden: t.memberships.map((m) => ({ id: m.user.id, email: m.user.email, disabledAt: m.user.disabledAt, rollen: m.user.memberships.map((x) => x.role) })) },
          eigenTest,
        ),
      )
      .map((t) => t.id),
  );
}

/** De echte aanmeldingen sinds `sinds` (isEchteAanmelding), alleen het moment. */
export async function echteAanmeldingen(sinds: Date, eigenTest: EigenTest | null): Promise<{ createdAt: Date }[]> {
  const users = await prisma.user.findMany({
    where: { createdAt: { gte: sinds } },
    take: LIMIET,
    select: { id: true, email: true, createdAt: true, disabledAt: true, memberships: { select: { role: true, tenantId: true, tenant: { select: { name: true } } } } },
  });
  return users
    .filter((u) =>
      isEchteAanmelding(
        { id: u.id, email: u.email, disabledAt: u.disabledAt, rollen: u.memberships.map((m) => m.role), tenantIds: u.memberships.map((m) => m.tenantId), tenantNamen: u.memberships.map((m) => m.tenant.name) },
        eigenTest,
      ),
    )
    .map((u) => ({ createdAt: u.createdAt }));
}

type KlusFeiten = { title: string; createdAt: Date; branch: { tenantId: string; tenant: { name: string } } };
const echteKlus = (echt: Set<string>, eigenTest: EigenTest | null) => (s: KlusFeiten) =>
  echt.has(s.branch.tenantId) && !isTestklus({ title: s.title, bedrijf: s.branch.tenant.name, eigenTest: isEigenTestKlus(eigenTest, { tenantId: s.branch.tenantId, createdAt: s.createdAt }) });
const KLUS_SELECT = { title: true, createdAt: true, branch: { select: { tenantId: true, tenant: { select: { name: true } } } } } as const;

export async function haalWeekCijfers(nu: Date = new Date()): Promise<WeekCijfers> {
  const w = weken(nu);
  const start = w[0]?.van ?? nu;
  const eigenTest = await leesEigenTest().catch(() => null);
  const echt = await safe(() => echteBedrijfIds(eigenTest), new Set<string>());
  const isEchteKlus = echteKlus(echt, eigenTest);

  const [bezoek, aanmeldingen, klussen, uren, facturen, bestellingen] = await Promise.all([
    // dezelfde telling als "Unieke bezoekers" op het Controlecentrum (lib/admin/insights/common.ts), per week. createdAt is een
    // tijd zonder zone in UTC: eerst als UTC lezen, dan naar Nederlandse tijd (anders schuift zondagavond naar de verkeerde week)
    safe(
      () => prisma.$queryRaw<{ week: string; bezoekers: bigint }[]>`
        SELECT to_char(date_trunc('week', ("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Amsterdam'), 'YYYY-MM-DD') AS week, count(DISTINCT "sessionId") AS bezoekers
        FROM "AnalyticsEvent"
        WHERE type = 'PAGEVIEW' AND "createdAt" >= ${start}
        GROUP BY 1`,
      [],
    ),
    safe(() => echteAanmeldingen(start, eigenTest), []),
    safe(() => prisma.shift.findMany({ where: { createdAt: { gte: start }, status: { not: "DRAFT" } }, take: LIMIET, select: KLUS_SELECT }), []),
    safe(
      () =>
        prisma.timesheet.findMany({
          where: { status: { in: ["APPROVED", "PAID"] }, scheduledStart: { gte: start } },
          take: LIMIET,
          select: { billableMinutes: true, scheduledStart: true, assignment: { select: { shift: { select: KLUS_SELECT } } } },
        }),
      [],
    ),
    // betaald aan ZekerFlex: geen self-billing van een zzp'er, en niet van een testbedrijf
    safe(() => prisma.invoice.findMany({ where: { status: "PAID", paidAt: { gte: start }, issuerFreelancerId: null }, take: LIMIET, select: { totalCents: true, paidAt: true, recipientTenantId: true } }), []),
    safe(() => prisma.shopOrder.findMany({ where: { status: { in: ["RECEIVED", "CONFIRMED", "SHIPPED"] }, createdAt: { gte: start } }, take: LIMIET, select: { totalCents: true, createdAt: true, email: true } }), []),
  ]);

  const bezoekPerWeek = new Map(bezoek.map((r) => [r.week, Number(r.bezoekers)]));
  const echteFacturen = facturen.filter((f) => !f.recipientTenantId || echt.has(f.recipientTenantId));
  const echteBestellingen = bestellingen.filter((b) => !isTestAccount({ email: b.email, rollen: [], disabledAt: null, tenantNamen: [] }));
  const shop = perWeek(w, echteBestellingen, (b) => b.createdAt, (b) => b.totalCents);
  const betaald = perWeek(w, echteFacturen, (f) => f.paidAt, (f) => f.totalCents).map((c, i) => c + (shop[i] ?? 0));

  return maakWeekCijfers(w, {
    bezoekers: w.map((x) => bezoekPerWeek.get(x.key) ?? 0),
    aanmeldingen: perWeek(w, aanmeldingen, (u) => u.createdAt),
    klussen: perWeek(w, klussen.filter(isEchteKlus), (s) => s.createdAt),
    uren: perWeek(w, uren.filter((t) => isEchteKlus(t.assignment.shift)), (t) => t.scheduledStart, (t) => t.billableMinutes / 60),
    betaald,
  });
}
