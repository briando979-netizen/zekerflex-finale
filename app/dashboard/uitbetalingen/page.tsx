import { requirePrincipal } from "@/lib/auth";
import { getFreelancerOverview } from "@/lib/dashboard/freelancer";
import { PageHeader, Panel, EmptyState, KpiCard, StatusPill, money, moneyExact, dateShort } from "@/components/app/ui";
import { PayoutSpeedPanel } from "@/components/app/PayoutSpeedPanel";

export const dynamic = "force-dynamic";

const TONE: Record<string, "ok" | "warn" | "crit" | "neutral"> = {
  SETTLED: "ok",
  PAID: "ok",
  SUBMITTED: "warn",
  PENDING: "warn",
  ISSUED: "warn",
  FAILED: "crit",
  RETURNED: "crit",
};

export default async function UitbetalingenPage() {
  const principal = await requirePrincipal();
  const o = await getFreelancerOverview(principal.userId);

  return (
    <>
      <PageHeader title="Uitbetalingen" subtitle="Automatisch aangemaakte facturen en directe SEPA-overboekingen." />

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard label="Verdiend deze maand" value={money(o.kpis.earnedThisMonthCents)} tone="brand" />
        <KpiCard label="Openstaand" value={money(o.kpis.pendingPayoutCents)} hint="wordt automatisch overgemaakt" />
        <KpiCard label="Facturen totaal" value={String(o.payouts.length)} />
      </div>

      <div className="mt-8">
        <PayoutSpeedPanel />
      </div>

      <div className="mt-8">
        <Panel title="Alle uitbetalingen">
          {o.payouts.length === 0 ? (
            <EmptyState
              title="Nog geen uitbetalingen"
              body="Zodra een opdrachtgever je uren goedkeurt, maakt ZekerFlex de factuur aan en kies je zelf hoe snel je uitbetaald wilt worden."
            />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hair text-left text-xs uppercase tracking-wide text-neutralx-500">
                  <th className="px-5 py-2.5 font-medium">Factuur</th>
                  <th className="px-5 py-2.5 font-medium">Aangemaakt</th>
                  <th className="px-5 py-2.5 font-medium">Uitbetaald</th>
                  <th className="px-5 py-2.5 text-right font-medium">Bedrag</th>
                  <th className="px-5 py-2.5 text-right font-medium">Status</th>
                  <th className="px-5 py-2.5 text-right font-medium">Factuur</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hair">
                {o.payouts.map((p) => (
                  <tr key={p.id}>
                    <td className="px-5 py-3 font-mono text-xs text-neutralx-600">{p.number}</td>
                    <td className="px-5 py-3 text-neutralx-600">{dateShort(p.createdAt)}</td>
                    <td className="px-5 py-3 text-neutralx-600">
                      {p.settledAt ? dateShort(p.settledAt) : "—"}
                    </td>
                    <td className="num px-5 py-3 text-right font-medium">{moneyExact(p.totalCents)}</td>
                    <td className="px-5 py-3 text-right">
                      <StatusPill tone={TONE[p.status] ?? "neutral"}>
                        {p.status === "SETTLED" ? "Uitbetaald" : p.status === "PENDING" ? "In behandeling" : p.status}
                      </StatusPill>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <a
                        href={`/api/invoices/${p.id}/pdf`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-brand-600 hover:underline"
                      >
                        PDF ↓
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>
    </>
  );
}
