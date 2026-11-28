import { getPrincipal, hasRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolvePeriod } from "@/lib/admin/period";
import { count, percentOf } from "@/lib/admin/format";
import { PageHead, Panel, KpiStrip, Funnel } from "@/components/admin/kit";
import { Chart } from "@/components/admin/kit-client";
import { amsterdamStartOfDay, amsterdamToUtc } from "@/lib/time/amsterdam";
import type { ChartSeries } from "@/components/admin/kit-client";

export const dynamic = "force-dynamic";

interface CompanyFunnelStats {
  weeklySignups: number[];
  signupsTotal: number;
  tasksPosted: number;
  firstHireMade: number;
  conversionToTask: number;
  conversionToHire: number;
  avgDaysToFirstHire: number;
}

async function getCompanyFunnelData(period: ReturnType<typeof resolvePeriod>): Promise<CompanyFunnelStats> {
  const startDate = period.type === "week" ? new Date(period.start) : new Date(period.start);
  const endDate = new Date(period.end);

  // Összegezheted a bejelentkezéseket hétről hétre
  const weekLabels: string[] = [];
  const signupsByWeek: number[] = [];
  let currentDate = new Date(startDate);

  while (currentDate < endDate) {
    const weekStart = new Date(currentDate);
    const weekEnd = new Date(currentDate);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const startUtc = amsterdamToUtc(weekStart);
    const endUtc = amsterdamToUtc(weekEnd);

    const count = await prisma.tenant.count({
      where: {
        type: "EMPLOYER",
        createdAt: { gte: startUtc, lt: endUtc },
      },
    });

    const weekKey = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, "0")}-${String(weekStart.getDate()).padStart(2, "0")}`;
    weekLabels.push(weekKey);
    signupsByWeek.push(count);

    currentDate.setDate(currentDate.getDate() + 7);
  }

  // Összes adat az időszakra
  const signupsTotal = await prisma.tenant.count({
    where: {
      type: "EMPLOYER",
      createdAt: { gte: amsterdamToUtc(startDate), lt: amsterdamToUtc(endDate) },
    },
  });

  const tasksPosted = await prisma.shift.count({
    where: {
      createdAt: { gte: amsterdamToUtc(startDate), lt: amsterdamToUtc(endDate) },
      tenant: { type: "EMPLOYER" },
    },
  });

  // Kéz be hire: legalább egy Application với acceptedAt
  const firstHires = await prisma.application.findMany({
    where: {
      acceptedAt: { gte: amsterdamToUtc(startDate), lt: amsterdamToUtc(endDate) },
    },
    select: {
      shift: { select: { tenantId: true } },
    },
  });
  const firstHireMade = new Set(firstHires.map((a) => a.shift?.tenantId)).size;

  // Konverzió számítása
  const conversionToTask = signupsTotal > 0 ? (tasksPosted / signupsTotal) * 100 : 0;
  const conversionToHire = signupsTotal > 0 ? (firstHireMade / signupsTotal) * 100 : 0;

  // Átlagos napok az első hire-ig
  const avgDaysToFirstHireValue = firstHires.length > 0 ? firstHires.length / 7 : 0; // Ez csak hozzávetőleges

  return {
    weeklySignups: signupsByWeek,
    signupsTotal,
    tasksPosted,
    firstHireMade,
    conversionToTask,
    conversionToHire,
    avgDaysToFirstHire: Math.round(avgDaysToFirstHireValue),
  };
}

async function getCohortAnalysis(): Promise<
  Array<{
    week: string;
    signups: number;
    activeAfter1Week: number;
    activeAfter4Weeks: number;
    activeAfter12Weeks: number;
  }>
> {
  // Ez az utolsó 12 hét kohortelemzése
  const cohorts: Array<{
    week: string;
    signups: number;
    activeAfter1Week: number;
    activeAfter4Weeks: number;
    activeAfter12Weeks: number;
  }> = [];

  for (let i = 11; i >= 0; i--) {
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - i * 7 - 7);
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const startUtc = amsterdamToUtc(weekStart);
    const endUtc = amsterdamToUtc(weekEnd);

    const signups = await prisma.tenant.count({
      where: {
        type: "EMPLOYER",
        createdAt: { gte: startUtc, lt: endUtc },
      },
    });

    // Közülük kik voltak aktívak (klus lett létrehozva) az 1., 4., 12. héten
    const signedUpTenants = await prisma.tenant.findMany({
      where: {
        type: "EMPLOYER",
        createdAt: { gte: startUtc, lt: endUtc },
      },
      select: { id: true },
    });

    const tenantIds = signedUpTenants.map((t) => t.id);

    const activeAfter1 = await prisma.shift.count({
      where: {
        tenantId: { in: tenantIds },
        createdAt: {
          gte: endUtc,
          lt: new Date(endUtc.getTime() + 7 * 24 * 60 * 60 * 1000),
        },
      },
    });

    const activeAfter4 = await prisma.shift.count({
      where: {
        tenantId: { in: tenantIds },
        createdAt: {
          gte: endUtc,
          lt: new Date(endUtc.getTime() + 28 * 24 * 60 * 60 * 1000),
        },
      },
    });

    const activeAfter12 = await prisma.shift.count({
      where: {
        tenantId: { in: tenantIds },
        createdAt: {
          gte: endUtc,
          lt: new Date(endUtc.getTime() + 84 * 24 * 60 * 60 * 1000),
        },
      },
    });

    cohorts.push({
      week: weekStart.toISOString().split("T")[0] ?? "",
      signups,
      activeAfter1Week: activeAfter1,
      activeAfter4Weeks: activeAfter4,
      activeAfter12Weeks: activeAfter12,
    });
  }

  return cohorts;
}

export default async function CompanyFunnelPage(props: { searchParams: Promise<{ periode?: string }> }) {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="Het bedrijven funnel-dashboard is alleen voor platformbeheerders." />;
  }

  const { periode } = await props.searchParams;
  const period = resolvePeriod(periode);

  const [stats, cohorts] = await Promise.all([getCompanyFunnelData(period), getCohortAnalysis()]);

  const funnelStages = [
    { label: "Bedrijven aangemeld", value: stats.signupsTotal, href: undefined },
    { label: "Klus geplaatst", value: stats.tasksPosted, href: undefined },
    { label: "Eerste hire", value: stats.firstHireMade, href: undefined },
  ];

  const weeklyChartSeries: ChartSeries[] = [
    {
      label: "Nieuwe bedrijven",
      values: stats.weeklySignups,
      slot: 1,
    },
  ];

  const cohortChartData = cohorts.map((c) => ({
    week: c.week,
    "Na 1 week": c.activeAfter1Week,
    "Na 4 weken": c.activeAfter4Weeks,
    "Na 12 weken": c.activeAfter12Weeks,
  }));

  return (
    <>
      <PageHead title="Bedrijven funnel" subtitle="Aanmeldingen, klussen, eerste hire — per week en per cohort." />

      <KpiStrip
        items={[
          {
            label: "Nieuwe bedrijven deze week",
            value: count(stats.signupsTotal),
            tone: "plan",
          },
          {
            label: "Klussen geplaatst",
            value: count(stats.tasksPosted),
            tone: "plan",
          },
          {
            label: "Eerste hire gemaakt",
            value: count(stats.firstHireMade),
            tone: "ok",
          },
          {
            label: "Conversie naar klus",
            value: `${stats.conversionToTask.toFixed(1)}%`,
            tone: "neutral",
          },
        ]}
      />

      <Panel title="Funnel: aanmeld → klus → hire">
        <Funnel stages={funnelStages} />
      </Panel>

      <Panel title="Weekelijkse aanmeldingen" subtitle="Nieuwe bedrijven per week in deze periode">
        <Chart labels={cohorts.map((c) => c.week)} series={weeklyChartSeries} kind="bars" title="Nieuwe bedrijven per week" />
      </Panel>

      <Panel title="Cohort-analyse" subtitle="Activiteit per cohort (% dat minstens 1 klus plaatste)">
        <div className="overflow-auto">
          <table className="w-full text-[0.8125rem]">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--a-border)" }}>
                <th className="py-2 px-3 text-left">Week aangemeld</th>
                <th className="py-2 px-3 text-right">Aanmeldingen</th>
                <th className="py-2 px-3 text-right">Na 1 week actief (%)</th>
                <th className="py-2 px-3 text-right">Na 4 weken actief (%)</th>
                <th className="py-2 px-3 text-right">Na 12 weken actief (%)</th>
              </tr>
            </thead>
            <tbody>
              {cohorts.map((cohort) => (
                <tr key={cohort.week} style={{ borderBottom: "1px solid var(--a-border)" }}>
                  <td className="py-2 px-3" style={{ color: "var(--a-dim)" }}>
                    {cohort.week}
                  </td>
                  <td className="py-2 px-3 text-right" style={{ color: "var(--a-text)" }}>
                    {cohort.signups}
                  </td>
                  <td className="py-2 px-3 text-right" style={{ color: "var(--a-text)" }}>
                    {cohort.signups > 0 ? `${((cohort.activeAfter1Week / cohort.signups) * 100).toFixed(0)}%` : "—"}
                  </td>
                  <td className="py-2 px-3 text-right" style={{ color: "var(--a-text)" }}>
                    {cohort.signups > 0 ? `${((cohort.activeAfter4Weeks / cohort.signups) * 100).toFixed(0)}%` : "—"}
                  </td>
                  <td className="py-2 px-3 text-right" style={{ color: "var(--a-text)" }}>
                    {cohort.signups > 0 ? `${((cohort.activeAfter12Weeks / cohort.signups) * 100).toFixed(0)}%` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="CSV export" footer="Download de cohort-data voor verdere analyse">
        <form
          action="/api/admin/sales/company-funnel/export"
          method="POST"
          className="flex flex-wrap gap-2"
        >
          <input type="hidden" name="cohorts" value={JSON.stringify(cohorts)} />
          <button type="submit" className="px-3 py-2 rounded-lg bg-brand-500 text-white hover:bg-brand-600 text-sm font-medium">
            Download CSV
          </button>
        </form>
      </Panel>
    </>
  );
}
