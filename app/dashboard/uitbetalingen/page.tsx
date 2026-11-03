import { redirect } from "next/navigation";
import { requirePrincipal } from "@/lib/auth";
import { getFiscal, invoiceModeFor } from "@/lib/fiscal/store";
import { getFreelancerOverview } from "@/lib/dashboard/freelancer";
import { PageHeader, Panel, EmptyState, KpiCard, StatusPill, money, moneyExact } from "@/components/app/ui";
import { PayoutSpeedPanel } from "@/components/app/PayoutSpeedPanel";
import { BackLink } from "@/components/app/BackLink";
import { getFreelancerDict } from "@/lib/i18n/server";

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
  // Uitzendkrachten have no invoices: they are paid through payroll.
  if (invoiceModeFor(await getFiscal(principal.userId)) === "payroll") redirect("/dashboard/verloning");
  const [o, ft] = await Promise.all([getFreelancerOverview(principal.userId), getFreelancerDict()]);
  const t = ft.pay;
  // Bedragen en datums in de taal van de app, altijd Nederlandse tijd.
  const dateFmt = (d: Date | string) => new Date(d).toLocaleDateString(ft.intl, { day: "numeric", month: "short", timeZone: "Europe/Amsterdam" });

  return (
    <>
      <BackLink fallbackHref="/dashboard/account" label={t.back} />
      <PageHeader title={t.title} subtitle={t.subtitle} />

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard label={t.earnedThisMonth} value={money(o.kpis.earnedThisMonthCents)} tone="brand" />
        <KpiCard label={t.pending} value={money(o.kpis.pendingPayoutCents)} hint={t.pendingHint} />
        <KpiCard label={t.invoicesTotal} value={String(o.payouts.length)} />
      </div>

      <div className="mt-8">
        <PayoutSpeedPanel />
      </div>

      <div className="mt-8">
        <Panel title={t.allPayouts}>
          {o.payouts.length === 0 ? (
            <EmptyState
              title={t.emptyTitle}
              body={t.emptyBody}
            />
          ) : (
            // Six columns don't fit a phone: scroll sideways there instead of widening the page.
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hair text-left text-xs uppercase tracking-wide text-neutralx-500">
                  <th className="px-5 py-2.5 font-medium">{t.colInvoice}</th>
                  <th className="px-5 py-2.5 font-medium">{t.colCreated}</th>
                  <th className="px-5 py-2.5 font-medium">{t.colPaid}</th>
                  <th className="px-5 py-2.5 text-right font-medium">{t.colAmount}</th>
                  <th className="px-5 py-2.5 text-right font-medium">{t.colStatus}</th>
                  <th className="px-5 py-2.5 text-right font-medium">{t.colInvoice}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hair">
                {o.payouts.map((p) => (
                  <tr key={p.id}>
                    <td className="px-5 py-3 font-mono text-xs text-neutralx-600">{p.number}</td>
                    <td className="px-5 py-3 text-neutralx-600">{dateFmt(p.createdAt)}</td>
                    <td className="px-5 py-3 text-neutralx-600">
                      {p.settledAt ? dateFmt(p.settledAt) : "—"}
                    </td>
                    <td className="num px-5 py-3 text-right font-medium">{moneyExact(p.totalCents)}</td>
                    <td className="px-5 py-3 text-right">
                      <StatusPill tone={TONE[p.status] ?? "neutral"}>
                        {p.status === "SETTLED" ? t.statusSettled : p.status === "PENDING" ? t.statusPending : p.status}
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
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
