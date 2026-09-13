import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { PageHeader, Panel, EmptyState, StatusPill, KpiCard, money, moneyExact, dateTime } from "@/components/app/ui";
import { ApproveButton } from "@/components/app/ApproveButton";
import { fraudForTimesheets } from "@/lib/fraud/timesheet";
import { getDict } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/dictionaries";

export const dynamic = "force-dynamic";

export default async function UrenGoedkeurenPage() {
  const h = (await getDict()).hours;
  const principal = await requirePrincipal();
  const scope = await resolveEmployerScope(principal);
  const branchFilter = scope.branchIds
    ? { id: { in: scope.branchIds } }
    : { tenantId: { in: scope.tenantIds } };

  const timesheets = await prisma.timesheet.findMany({
    where: { branch: branchFilter, status: { in: ["SUBMITTED", "DISPUTED"] } },
    select: {
      id: true,
      status: true,
      scheduledStart: true,
      scheduledEnd: true,
      actualStart: true,
      actualEnd: true,
      breakMinutes: true,
      billableMinutes: true,
      hourlyRateCents: true,
      freelancerId: true,
      extraCostsCents: true,
      extraCostsNote: true,
      branch: { select: { name: true } },
      freelancer: { select: { user: { select: { fullName: true } } } },
      dispute: { select: { origin: true } },
      gpsEvents: {
        select: { type: true, mocked: true, withinGeofence: true, distanceToBranchMeters: true, recordedAt: true },
      },
    },
    orderBy: { submittedAt: "asc" },
    take: 50,
  });

  const fraud = await fraudForTimesheets(timesheets);
  const flaggedCount = [...fraud.values()].filter((f) => f.some((x) => x.severity !== "info")).length;

  const lineTotal = (t: (typeof timesheets)[number]) =>
    Math.round((t.billableMinutes / 60) * t.hourlyRateCents);
  const pendingTotal = timesheets.reduce((sum, t) => sum + lineTotal(t), 0);
  const disputed = timesheets.filter((t) => t.status === "DISPUTED").length;
  const totalHours = timesheets.reduce((sum, t) => sum + t.billableMinutes, 0) / 60;
  const oldest = timesheets[0]?.scheduledStart ?? null;

  return (
    <>
      <PageHeader title={h.title} subtitle={h.subtitle} />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label={h.kpiOpen} value={String(timesheets.length)} tone="brand" hint={h.kpiOpenHint} />
        <KpiCard label={h.kpiAmount} value={money(pendingTotal)} hint={fmt(h.kpiAmountHint, { h: totalHours.toFixed(1) })} />
        <KpiCard
          label={h.kpiDisputed}
          value={String(disputed)}
          tone={disputed > 0 ? "crit" : "default"}
          hint={disputed > 0 ? h.kpiDisputedYes : h.kpiDisputedNo}
        />
        <KpiCard
          label={h.kpiOldest}
          value={oldest ? dateTime(oldest).split(",")[0]!.trim() : "—"}
          hint={oldest ? h.kpiOldestYes : h.kpiOldestNo}
        />
      </div>

      {flaggedCount > 0 && (
        <div className="mb-4 rounded-xl border border-warn/40 bg-warn/5 px-4 py-3 text-sm">
          <span className="font-semibold text-ink">
            {flaggedCount} {flaggedCount === 1 ? "urenbriefje heeft" : "urenbriefjes hebben"} een signaal
          </span>{" "}
          <span className="text-neutralx-600">
            (GPS, onmogelijke tijden, pauze of dubbele uren). Controleer voor je goedkeurt — bij een
            ⛔ blokkeert ZekerFlex de goedkeuring en volgt handmatige controle door het platform.
          </span>
        </div>
      )}

      <Panel title={fmt(h.panelSubmitted, { n: timesheets.length })}>
        {timesheets.length === 0 ? (
          <EmptyState title={h.emptyTitle} body={h.emptyBody} />
        ) : (
          <ul className="divide-y divide-hair">
            {timesheets.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-ink">{t.freelancer.user.fullName}</p>
                    {t.status === "DISPUTED" && <StatusPill tone="crit">{h.disputePill}</StatusPill>}
                  </div>
                  <p className="text-xs text-neutralx-500">
                    {t.branch.name} · {dateTime(t.scheduledStart)} – {dateTime(t.scheduledEnd)} ·{" "}
                    {(t.billableMinutes / 60).toFixed(1)} u · {moneyExact(t.hourlyRateCents)}/u
                  </p>
                  {t.extraCostsCents ? (
                    <p className="mt-1 flex items-start gap-1.5 text-xs text-neutralx-600">
                      <span aria-hidden>💰</span>
                      Extra kosten: {moneyExact(t.extraCostsCents)} — {t.extraCostsNote}
                    </p>
                  ) : null}
                  {(fraud.get(t.id) ?? [])
                    .filter((f) => f.severity !== "info")
                    .map((f) => (
                      <p
                        key={f.code}
                        className={`mt-1 flex items-start gap-1.5 text-xs ${
                          f.severity === "critical" ? "font-semibold text-crit" : "text-warn"
                        }`}
                      >
                        <span aria-hidden>{f.severity === "critical" ? "⛔" : "⚠️"}</span>
                        {f.message}
                      </p>
                    ))}
                </div>
                <div className="flex items-center gap-4">
                  <span className="num font-mono text-sm font-medium text-ink">
                    {moneyExact(lineTotal(t))}
                  </span>
                  {t.status === "SUBMITTED" ? (
                    <ApproveButton timesheetId={t.id} />
                  ) : (
                    <span className="text-xs text-neutralx-400">{h.viaConsole}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
