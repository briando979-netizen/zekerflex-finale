import { getPrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

interface ReactionStats {
  total: number;
  accepted: number;
  declined: number;
  reserved: number;
  acceptRate: number;
  declineRate: number;
  reserveRate: number;
  trendVsLastWeek: "up" | "down" | "stable";
}

async function getEmployerReactionStats(tenantId: string): Promise<ReactionStats | null> {
  try {
    // Get all shifts for this employer
    const shifts = await prisma.shift.findMany({
      where: { branch: { tenant: { id: tenantId } } },
      select: { id: true },
    });

    if (shifts.length === 0) {
      return null;
    }

    const shiftIds = shifts.map((s) => s.id);

    // Get reaction events for these shifts - fetch last 14 days to split into this week and last week
    const now = new Date();
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const events = await prisma.analyticsEvent.findMany({
      where: {
        createdAt: { gte: twoWeeksAgo },
        label: {
          in: [
            "shift_reaction_accept",
            "shift_reaction_decline",
            "shift_reaction_reserve",
          ],
        },
      },
      select: {
        createdAt: true,
        label: true,
        meta: true,
      },
    });

    // Filter for this employer's shifts
    let accepted = 0;
    let declined = 0;
    let reserved = 0;
    let thisWeekTotal = 0;
    let lastWeekTotal = 0;

    for (const event of events) {
      const meta = event.meta as Record<string, unknown>;
      const shiftId = typeof meta?.shiftId === "string" ? meta.shiftId : "";

      if (!shiftIds.includes(shiftId)) continue;

      // Split events into this week (last 7 days) and last week (7-14 days ago)
      const isThisWeek = event.createdAt >= new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      if (isThisWeek) thisWeekTotal += 1;
      else lastWeekTotal += 1;

      if (event.label === "shift_reaction_accept") accepted += 1;
      else if (event.label === "shift_reaction_decline") declined += 1;
      else if (event.label === "shift_reaction_reserve") reserved += 1;
    }

    const total = accepted + declined + reserved;
    if (total === 0) return null;

    return {
      total,
      accepted,
      declined,
      reserved,
      acceptRate: Math.round((accepted / total) * 100),
      declineRate: Math.round((declined / total) * 100),
      reserveRate: Math.round((reserved / total) * 100),
      trendVsLastWeek:
        thisWeekTotal > lastWeekTotal ? "up" : thisWeekTotal < lastWeekTotal ? "down" : "stable",
    };
  } catch {
    return null;
  }
}

export default async function EmployerReactionAnalyticsPage() {
  const principal = await getPrincipal();
  if (!principal || principal.type !== "bedrijf") {
    redirect("/werkgever");
  }

  const stats = await getEmployerReactionStats(principal.tenantId);

  if (!stats) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="text-2xl font-bold text-ink">Reacties</h1>
        <p className="mt-2 text-neutralx-600">
          Nog geen reacties op je klussen. Plaats een klus om reacties te ontvangen.
        </p>
      </div>
    );
  }

  const trendIcon =
    stats.trendVsLastWeek === "up"
      ? "↑"
      : stats.trendVsLastWeek === "down"
        ? "↓"
        : "→";
  const trendText =
    stats.trendVsLastWeek === "up"
      ? "meer dan vorige week"
      : stats.trendVsLastWeek === "down"
        ? "minder dan vorige week"
        : "gelijk als vorige week";

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold text-ink">Reacties op je klussen</h1>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-hair bg-white p-4">
          <div className="text-sm font-medium text-neutralx-600">Totale reacties</div>
          <div className="mt-2 flex items-baseline gap-2">
            <div className="text-3xl font-bold text-ink">{stats.total}</div>
            <div className="text-sm text-neutralx-500">
              {trendIcon} {trendText}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-hair bg-white p-4">
          <div className="text-sm font-medium text-neutralx-600">Acceptatierate</div>
          <div className="mt-2 flex items-baseline gap-2">
            <div className="text-3xl font-bold text-ok">{stats.acceptRate}%</div>
            <div className="text-sm text-neutralx-500">{stats.accepted} aangenomen</div>
          </div>
        </div>

        <div className="rounded-lg border border-hair bg-white p-4">
          <div className="text-sm font-medium text-neutralx-600">Afwijzingsrate</div>
          <div className="mt-2 flex items-baseline gap-2">
            <div className="text-3xl font-bold text-crit">{stats.declineRate}%</div>
            <div className="text-sm text-neutralx-500">{stats.declined} afgewezen</div>
          </div>
        </div>

        <div className="rounded-lg border border-hair bg-white p-4">
          <div className="text-sm font-medium text-neutralx-600">Gereserveerd</div>
          <div className="mt-2 flex items-baseline gap-2">
            <div className="text-3xl font-bold text-plan-ink">{stats.reserveRate}%</div>
            <div className="text-sm text-neutralx-500">{stats.reserved} gereserveerd</div>
          </div>
        </div>
      </div>

      <div className="mt-8 rounded-lg border border-hair bg-paper-soft p-4">
        <h2 className="font-semibold text-ink">Wat betekent dit?</h2>
        <ul className="mt-3 space-y-2 text-sm text-neutralx-700">
          <li>
            <strong>Aangenomen:</strong> Werkers die je klus accepteerden en nu zijn ingepland.
          </li>
          <li>
            <strong>Afgewezen:</strong> Werkers die je klus afwezen.
          </li>
          <li>
            <strong>Gereserveerd:</strong> Werkers die op de reservebank staan voor het geval iemand
            afzegt.
          </li>
        </ul>
      </div>
    </div>
  );
}
