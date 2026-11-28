import { getPrincipal, hasRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHead, KpiStrip, Panel, BarList } from "@/components/admin/kit";
import { Chart } from "@/components/admin/kit-client";
import { count, percentOf } from "@/lib/admin/format";

export const dynamic = "force-dynamic";

interface ReactionMetrics {
  total: number;
  accepted: number;
  declined: number;
  reserved: number;
  counterOffered: number;
  acceptRate: number;
  declineRate: number;
  reserveRate: number;
}

interface DailyMetrics extends ReactionMetrics {
  date: string;
}

async function getReactionMetrics(days: number): Promise<{
  total: ReactionMetrics;
  daily: DailyMetrics[];
  topShifts: Array<{ shiftId: string; count: number; accepted: number; declined: number }>;
}> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  // Get all reaction events
  const events = await prisma.analyticsEvent.findMany({
    where: {
      createdAt: { gte: since },
      label: {
        in: [
          "shift_reaction_accept",
          "shift_reaction_decline",
          "shift_reaction_reserve",
          "shift_reaction_counter_offer",
        ],
      },
    },
    select: {
      createdAt: true,
      label: true,
      meta: true,
    },
  });

  // Parse and aggregate
  const byDate: Record<string, ReactionMetrics> = {};
  const byShift: Record<string, { total: number; accepted: number; declined: number }> = {};
  let totalAccepted = 0;
  let totalDeclined = 0;
  let totalReserved = 0;
  let totalCounterOffer = 0;

  for (const event of events) {
    const date = event.createdAt.toISOString().split("T")[0];
    const meta = event.meta as Record<string, unknown>;
    const shiftId = typeof meta?.shiftId === "string" ? meta.shiftId : "";

    if (!byDate[date]) {
      byDate[date] = {
        total: 0,
        accepted: 0,
        declined: 0,
        reserved: 0,
        counterOffered: 0,
        acceptRate: 0,
        declineRate: 0,
        reserveRate: 0,
      };
    }

    byDate[date].total += 1;

    if (event.label === "shift_reaction_accept") {
      byDate[date].accepted += 1;
      totalAccepted += 1;
      if (shiftId) {
        if (!byShift[shiftId]) byShift[shiftId] = { total: 0, accepted: 0, declined: 0 };
        byShift[shiftId].accepted += 1;
        byShift[shiftId].total += 1;
      }
    } else if (event.label === "shift_reaction_decline") {
      byDate[date].declined += 1;
      totalDeclined += 1;
      if (shiftId) {
        if (!byShift[shiftId]) byShift[shiftId] = { total: 0, accepted: 0, declined: 0 };
        byShift[shiftId].declined += 1;
        byShift[shiftId].total += 1;
      }
    } else if (event.label === "shift_reaction_reserve") {
      byDate[date].reserved += 1;
      totalReserved += 1;
    } else if (event.label === "shift_reaction_counter_offer") {
      byDate[date].counterOffered += 1;
      totalCounterOffer += 1;
    }
  }

  // Calculate rates and prepare daily array
  const daily: DailyMetrics[] = Object.entries(byDate)
    .map(([date, metrics]) => ({
      date,
      ...metrics,
      acceptRate: metrics.total > 0 ? Math.round((metrics.accepted / metrics.total) * 100) : 0,
      declineRate: metrics.total > 0 ? Math.round((metrics.declined / metrics.total) * 100) : 0,
      reserveRate: metrics.total > 0 ? Math.round((metrics.reserved / metrics.total) * 100) : 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const totalReactions = totalAccepted + totalDeclined + totalReserved + totalCounterOffer;
  const total: ReactionMetrics = {
    total: totalReactions,
    accepted: totalAccepted,
    declined: totalDeclined,
    reserved: totalReserved,
    counterOffered: totalCounterOffer,
    acceptRate: totalReactions > 0 ? Math.round((totalAccepted / totalReactions) * 100) : 0,
    declineRate: totalReactions > 0 ? Math.round((totalDeclined / totalReactions) * 100) : 0,
    reserveRate: totalReactions > 0 ? Math.round((totalReserved / totalReactions) * 100) : 0,
  };

  // Top shifts by reaction count
  const topShifts = Object.entries(byShift)
    .map(([shiftId, metrics]) => ({
      shiftId,
      count: metrics.total,
      accepted: metrics.accepted,
      declined: metrics.declined,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return { total, daily, topShifts };
}

export default async function ReactionAnalyticsPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return (
      <PageHead title="Geen toegang" subtitle="Deze pagina is alleen beschikbaar voor platformbeheerders." />
    );
  }

  const { total, daily, topShifts } = await getReactionMetrics(30);

  const decisionMadeCount = total.accepted + total.declined;
  const decisionRate =
    total.total > 0 ? Math.round((decisionMadeCount / total.total) * 100) : 0;

  return (
    <div className="space-y-4">
      <PageHead
        title="Klus-reacties"
        subtitle="Reacties op klusaanbiedingen: aangenomen, afgewezen en gereserveerd."
      />

      <KpiStrip
        items={[
          {
            label: "Totale reacties",
            value: count(total.total),
            hint: `${count(total.accepted)} aangenomen, ${count(total.declined)} afgewezen`,
          },
          {
            label: "Acceptatierate",
            value: `${total.acceptRate}%`,
            hint: `${count(total.accepted)} van ${count(total.total)}`,
          },
          {
            label: "Afwijzingsrate",
            value: `${total.declineRate}%`,
            hint: `${count(total.declined)} van ${count(total.total)}`,
          },
          {
            label: "Besluittarief",
            value: `${decisionRate}%`,
            hint: `${count(decisionMadeCount)} van ${count(total.total)} reacties`,
          },
          {
            label: "Gereserveerd",
            value: count(total.reserved),
            hint: `${percentOf(total.reserved, total.total)}% van totaal`,
          },
        ]}
      />

      <Panel title="Reacties per dag" subtitle="Laatste 30 dagen">
        <Chart
          title="Reacties: aangenomen, afgewezen en gereserveerd"
          kind="area"
          unit="count"
          labels={daily.map((d) => d.date)}
          series={[
            {
              label: "Aangenomen",
              values: daily.map((d) => d.accepted),
              slot: 1,
            },
            {
              label: "Afgewezen",
              values: daily.map((d) => d.declined),
              slot: 2,
            },
            {
              label: "Gereserveerd",
              values: daily.map((d) => d.reserved),
              slot: 3,
            },
          ]}
          height={240}
          emptyText="Nog geen data in deze periode."
        />
      </Panel>

      <Panel title="Acceptatierate per dag" subtitle="Laatste 30 dagen">
        <Chart
          title="Acceptatierate (%) en aantal reacties"
          kind="line"
          unit="percentage"
          labels={daily.map((d) => d.date)}
          series={[
            {
              label: "Acceptatierate",
              values: daily.map((d) => d.acceptRate),
              slot: 1,
            },
            {
              label: "Totale reacties",
              values: daily.map((d) => d.total),
              slot: 2,
            },
          ]}
          height={240}
          emptyText="Nog geen data in deze periode."
        />
      </Panel>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Panel title="Meest gereageerde klussen" subtitle="Top 10 (laatste 30 dagen)">
          <BarList
            emptyText="Nog geen reacties."
            rows={topShifts.map((s) => ({
              key: s.shiftId,
              label: (
                <div className="space-y-1">
                  <div className="font-mono text-xs">{s.shiftId}</div>
                  <div className="text-xs text-gray-500">
                    {count(s.accepted)} aangenomen, {count(s.declined)} afgewezen
                  </div>
                </div>
              ),
              value: s.count,
              display: count(s.count),
            }))}
          />
        </Panel>

        <Panel title="Reactie-samenvatting" subtitle="Laatste 30 dagen">
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between border-b border-gray-100 pb-2">
              <span className="text-gray-600">Totale reacties</span>
              <span className="font-medium">{count(total.total)}</span>
            </div>
            <div className="flex items-center justify-between border-b border-gray-100 pb-2">
              <span className="text-gray-600">Aangenomen</span>
              <span className="font-medium text-green-600">
                {count(total.accepted)} ({total.acceptRate}%)
              </span>
            </div>
            <div className="flex items-center justify-between border-b border-gray-100 pb-2">
              <span className="text-gray-600">Afgewezen</span>
              <span className="font-medium text-red-600">
                {count(total.declined)} ({total.declineRate}%)
              </span>
            </div>
            <div className="flex items-center justify-between border-b border-gray-100 pb-2">
              <span className="text-gray-600">Gereserveerd</span>
              <span className="font-medium text-blue-600">
                {count(total.reserved)} ({total.reserveRate}%)
              </span>
            </div>
            <div className="flex items-center justify-between pt-2">
              <span className="font-medium text-gray-700">Besluiten gemaakt</span>
              <span className="font-bold">
                {count(decisionMadeCount)} ({decisionRate}%)
              </span>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
