import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { PageHeader, Panel, EmptyState, KpiCard, StatusPill, dateShort } from "@/components/app/ui";

export const dynamic = "force-dynamic";

const RISK_TONE: Record<string, "ok" | "warn" | "crit" | "neutral"> = {
  LOW: "ok",
  MEDIUM: "warn",
  HIGH: "crit",
};

export default async function WerkgeverCompliancePage() {
  const principal = await requirePrincipal();
  const scope = await resolveEmployerScope(principal);
  const branchFilter = scope.branchIds
    ? { id: { in: scope.branchIds } }
    : { tenantId: { in: scope.tenantIds } };

  const records = await prisma.dbaComplianceRecord.findMany({
    where: { branch: branchFilter },
    select: {
      id: true,
      riskLevel: true,
      action: true,
      rationale: true,
      totalMinutes: true,
      maxConsecutiveWeeks: true,
      clientRevenueShare: true,
      createdAt: true,
      branch: { select: { name: true } },
      freelancer: { select: { user: { select: { fullName: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 60,
  });

  const high = records.filter((r) => r.riskLevel === "HIGH").length;
  const medium = records.filter((r) => r.riskLevel === "MEDIUM").length;

  return (
    <>
      <PageHeader
        title="Compliance"
        subtitle="Wet DBA-signalen per samenwerking. ZekerFlex beperkt matching automatisch bij hoog risico."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard label="Hoog risico" value={String(high)} tone={high > 0 ? "crit" : "default"} />
        <KpiCard label="Aandacht" value={String(medium)} tone={medium > 0 ? "warn" : "default"} />
        <KpiCard label="Beoordelingen" value={String(records.length)} />
      </div>

      <div className="mt-8">
        <Panel title="Recente beoordelingen">
          {records.length === 0 ? (
            <EmptyState
              title="Geen signalen"
              body="Er zijn nog geen Wet DBA-risico's vastgesteld voor jouw vestigingen."
            />
          ) : (
            <ul className="divide-y divide-hair">
              {records.map((r) => (
                <li key={r.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-ink">
                      {r.freelancer.user.fullName} · {r.branch.name}
                    </p>
                    <div className="flex items-center gap-2">
                      <StatusPill tone={RISK_TONE[r.riskLevel] ?? "neutral"}>{r.riskLevel}</StatusPill>
                      <span className="pill-neutral">{r.action}</span>
                    </div>
                  </div>
                  <p className="mt-1 text-sm text-neutralx-600">{r.rationale}</p>
                  <p className="mt-1.5 font-mono text-xs text-neutralx-400">
                    {Math.round(r.totalMinutes / 60)} u · {r.maxConsecutiveWeeks} weken aaneen ·{" "}
                    {Math.round(r.clientRevenueShare * 100)}% omzetaandeel · {dateShort(r.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
