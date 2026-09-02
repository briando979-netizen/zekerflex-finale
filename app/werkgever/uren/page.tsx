import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { PageHeader, Panel, EmptyState, StatusPill, KpiCard, money, moneyExact, dateTime } from "@/components/app/ui";
import { ApproveButton } from "@/components/app/ApproveButton";

export const dynamic = "force-dynamic";

export default async function UrenGoedkeurenPage() {
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
      billableMinutes: true,
      hourlyRateCents: true,
      branch: { select: { name: true } },
      freelancer: { select: { user: { select: { fullName: true } } } },
      dispute: { select: { origin: true } },
    },
    orderBy: { submittedAt: "asc" },
    take: 50,
  });

  const lineTotal = (t: (typeof timesheets)[number]) =>
    Math.round((t.billableMinutes / 60) * t.hourlyRateCents);
  const pendingTotal = timesheets.reduce((sum, t) => sum + lineTotal(t), 0);
  const disputed = timesheets.filter((t) => t.status === "DISPUTED").length;
  const totalHours = timesheets.reduce((sum, t) => sum + t.billableMinutes, 0) / 60;
  const oldest = timesheets[0]?.scheduledStart ?? null;

  return (
    <>
      <PageHeader
        title="Uren goedkeuren"
        subtitle="Na goedkeuring worden de facturen automatisch aangemaakt. De kracht kiest daarna zelf hoe snel die uitbetaald wil worden."
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Open ter goedkeuring" value={String(timesheets.length)} tone="brand" hint="ingediende urenstaten" />
        <KpiCard label="Openstaand bedrag" value={money(pendingTotal)} hint={`${totalHours.toFixed(1)} uur totaal`} />
        <KpiCard
          label="In dispuut"
          value={String(disputed)}
          tone={disputed > 0 ? "crit" : "default"}
          hint={disputed > 0 ? "via disputen-console" : "geen open disputen"}
        />
        <KpiCard
          label="Langst wachtend"
          value={oldest ? dateTime(oldest).split(",")[0]!.trim() : "—"}
          hint={oldest ? "eerste dienst in de rij" : "niets in de wachtrij"}
        />
      </div>

      <Panel title={`Ingediend (${timesheets.length})`}>
        {timesheets.length === 0 ? (
          <EmptyState title="Niets te doen" body="Er staan geen uren open ter goedkeuring." />
        ) : (
          <ul className="divide-y divide-hair">
            {timesheets.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-ink">{t.freelancer.user.fullName}</p>
                    {t.status === "DISPUTED" && <StatusPill tone="crit">Dispuut</StatusPill>}
                  </div>
                  <p className="text-xs text-neutralx-500">
                    {t.branch.name} · {dateTime(t.scheduledStart)} – {dateTime(t.scheduledEnd)} ·{" "}
                    {(t.billableMinutes / 60).toFixed(1)} u · {moneyExact(t.hourlyRateCents)}/u
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="num font-mono text-sm font-medium text-ink">
                    {moneyExact(lineTotal(t))}
                  </span>
                  {t.status === "SUBMITTED" ? (
                    <ApproveButton timesheetId={t.id} />
                  ) : (
                    <span className="text-xs text-neutralx-400">Via disputen-console</span>
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
