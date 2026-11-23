import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { Panel, EmptyState, StatusPill, KpiCard, money, moneyExact, dateTime } from "@/components/app/ui";
import { PaginaKop } from "@/components/werkgever/PaginaKop";
import { ApproveButton } from "@/components/app/ApproveButton";
import { AutoApproveToggle } from "@/components/werkgever/AutoApproveToggle";
import { BulkApproveButton } from "@/components/werkgever/BulkApproveButton";
import { schoneUren } from "@/lib/timesheets/bulk-goedkeuren";
import { ProposeCorrectionButton } from "@/components/app/ProposeCorrectionButton";
import { fraudForTimesheets } from "@/lib/fraud/timesheet";
import { incheckenVereistVoor } from "@/lib/checkin/vereist";
import { zonderInchecken } from "@/lib/checkin/vereist-kern";
import { getDict } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/dictionaries";
import { SamenTabs } from "@/components/werkgever/SamenTabs";
import { samenTitel } from "@/lib/werkgever/samen-titel";

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
      branch: { select: { name: true, tenantId: true } },
      freelancer: { select: { user: { select: { fullName: true } } } },
      dispute: { select: { origin: true } },
      gpsEvents: {
        select: { type: true, mocked: true, withinGeofence: true, distanceToBranchMeters: true, recordedAt: true, bron: true, ontvangenOp: true },
      },
    },
    orderBy: { submittedAt: "asc" },
    take: 50,
  });

  const fraud = await fraudForTimesheets(timesheets);
  // Bedrijven die inchecken uit hebben (lib/checkin/vereist.ts): hun uren zijn zonder inchecken ingediend en jouw goedkeuring is
  // het bewijs; automatisch goedkeuren werkt daar niet, dus geen schakelaar maar een uitleg.
  const incheckVereist = await incheckenVereistVoor([...scope.tenantIds.slice(0, 1), ...timesheets.map((t) => t.branch.tenantId)]);
  const eersteBedrijf = scope.tenantIds[0];
  const autoUitgezet = eersteBedrijf ? incheckVereist.get(eersteBedrijf) === false : false;
  const flaggedCount = [...fraud.values()].filter((f) => f.some((x) => x.severity !== "info")).length;

  const lineTotal = (t: (typeof timesheets)[number]) =>
    Math.round((t.billableMinutes / 60) * t.hourlyRateCents);
  const pendingTotal = timesheets.reduce((sum, t) => sum + lineTotal(t), 0);
  const disputed = timesheets.filter((t) => t.status === "DISPUTED").length;
  const totalHours = timesheets.reduce((sum, t) => sum + t.billableMinutes, 0) / 60;
  const oldest = timesheets[0]?.scheduledStart ?? null;
  // de lijst bevat ingediende uren én open disputen: is hij leeg, dan valt er niets te tellen
  const ietsTeTellen = timesheets.length > 0;
  // zonder signaal, dispuut of extra kosten: in één keer goed te keuren (vanaf twee)
  const schoon = schoneUren(timesheets, fraud);
  const schoonTotal = timesheets.filter((t) => schoon.includes(t.id)).reduce((sum, t) => sum + lineTotal(t), 0);

  return (
    <>
      {/* met de vlag heet de ingang in het menu "Uren" (Goedkeuren is dan een tabblad eronder): de titel zegt hetzelfde */}
      <PaginaKop title={await samenTitel("uren", h.title)} subtitle={h.subtitle} />
      <SamenTabs groep="uren" actief="uren" />

      {autoUitgezet ? (
        <p className="mb-6 rounded-2xl border border-hair bg-white px-5 py-4 text-sm text-neutralx-600">{h.geenAutoGoedkeuren}</p>
      ) : (
        <AutoApproveToggle />
      )}

      {/* de vier tellers alleen als er iets te tellen valt (ingediende uren of een open dispuut);
          een nieuw bedrijf ziet anders vier vakken met nullen boven "Niets te doen" */}
      {ietsTeTellen && (
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
      )}

      {flaggedCount > 0 && (
        <div className="mb-4 rounded-xl border border-warn/40 bg-warn/5 px-4 py-3 text-sm">
          <span className="font-semibold text-ink">
            {fmt(flaggedCount === 1 ? h.signalOne : h.signalMany, { n: flaggedCount })}
          </span>{" "}
          <span className="text-neutralx-600">{h.signalBody}</span>
        </div>
      )}

      {schoon.length >= 2 && <BulkApproveButton ids={schoon} bedrag={moneyExact(schoonTotal)} />}

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
                      {h.extraCosts} {moneyExact(t.extraCostsCents)} — {t.extraCostsNote}
                    </p>
                  ) : null}
                  {zonderInchecken(incheckVereist.get(t.branch.tenantId) ?? true, t.gpsEvents.some((e) => e.type === "CHECK_IN")) && (
                    <p className="mt-1 flex items-start gap-1.5 text-xs text-neutralx-600">
                      <span aria-hidden>ℹ️</span>
                      {h.zonderInchecken}
                    </p>
                  )}
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
                <div className="flex flex-wrap items-center justify-end gap-3">
                  <span className="num font-mono text-sm font-medium text-ink">
                    {moneyExact(lineTotal(t))}
                  </span>
                  {t.status === "SUBMITTED" ? (
                    <div className="flex flex-col items-end gap-1.5">
                      <ApproveButton
                        timesheetId={t.id}
                        hasFlags={(fraud.get(t.id) ?? []).some((f) => f.severity !== "info")}
                        hasCriticalFlag={(fraud.get(t.id) ?? []).some((f) => f.severity === "critical")}
                        flagSummary={(fraud.get(t.id) ?? [])
                          .filter((f) => f.severity !== "info")
                          .map((f) => f.message)
                          .join(" ")}
                      />
                      <ProposeCorrectionButton timesheetId={t.id} submittedHours={t.billableMinutes / 60} />
                    </div>
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
