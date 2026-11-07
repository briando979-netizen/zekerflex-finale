import Link from "next/link";
import { requirePrincipal } from "@/lib/auth";
import { PageHeader, EmptyState } from "@/components/app/ui";
import { getEarningsForecast } from "@/lib/dashboard/earnings-forecast";
import { inAndroidApp } from "@/lib/app-mode-server";
import { getEarningsGoal } from "@/lib/dashboard/earnings-goal";
import { EarningsGoalCard } from "@/components/app/EarningsGoalCard";
import { getFreelancerDict } from "@/lib/i18n/server";
import { BANK_AAN } from "@/lib/app-mode";

export const dynamic = "force-dynamic";

function euro(cents: number): string {
  return `€ ${Math.round(cents / 100).toLocaleString("nl-NL")}`;
}

/** "**vet** rest" → nadruk + tekst, zodat elke taal zijn eigen woordvolgorde houdt. */
function rich(text: string) {
  return text.split("**").map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : part));
}

export default async function VooruitblikPage() {
  const principal = await requirePrincipal();
  const [forecast, inApp, goalCents, ft] = await Promise.all([
    getEarningsForecast(principal.userId),
    inAndroidApp(),
    getEarningsGoal(principal.userId),
    getFreelancerDict(),
  ]);
  const t = ft.fc;

  if (!forecast) {
    return (
      <>
        <Back label={t.back} />
        <PageHeader title={t.title} subtitle={t.noProfileSub} />
        <EmptyState icon="🔮" title={t.noProfileTitle} body={t.noProfileBody} />
      </>
    );
  }

  // Maandnamen in de app-taal (de berekening geeft het maandnummer mee).
  const monthLabel = `${ft.date.mon[forecast.month0] ?? ""} ${forecast.year}`;
  const maxTrend = Math.max(1, ...forecast.trend.map((p) => p.cents));
  const workedPct = forecast.expectedCents > 0 ? Math.round((forecast.workedCents / forecast.expectedCents) * 100) : 0;
  const [footBefore = "", footLink = "", footAfter = ""] = t.footer.split(/\[|\]/);

  return (
    <>
      <Back label={t.back} />
      <PageHeader title={t.title} subtitle={t.subtitle(monthLabel)} />

      <div className="space-y-6">
        {/* deze maand */}
        <div className="rounded-2xl border border-neutralx-200 bg-white p-5">
          <p className="text-xs uppercase tracking-wide text-neutralx-400">{t.expected}</p>
          <p className="mt-1 font-display text-4xl font-bold text-brand-600">{euro(forecast.expectedCents)}</p>

          {forecast.expectedCents > 0 && (
            <>
              <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-neutralx-200">
                <div className="h-full rounded-full bg-brand-500" style={{ width: `${workedPct}%` }} />
              </div>
              <div className="mt-2 flex justify-between text-xs text-neutralx-500">
                <span>{t.worked} <strong className="text-ink">{euro(forecast.workedCents)}</strong></span>
                <span>{t.planned} <strong className="text-ink">{euro(forecast.plannedCents)}</strong>{forecast.upcomingCount > 0 ? ` (${forecast.upcomingCount})` : ""}</span>
              </div>
            </>
          )}
          {forecast.expectedCents === 0 && <p className="mt-2 text-sm text-neutralx-500">{t.empty}</p>}
        </div>

        <EarningsGoalCard
          initialGoalCents={goalCents}
          workedCents={forecast.workedCents}
          expectedCents={forecast.expectedCents}
          monthLabel={monthLabel}
        />

        {/* belasting-potje (alleen zzp/flex) */}
        {!forecast.isPayroll ? (
          <div className="rounded-2xl border border-brand-100 bg-brand-50/50 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-lg font-semibold">{t.taxTitle}</h2>
                <p className="mt-1 text-sm text-neutralx-600">{rich(t.taxBody(forecast.taxPct))}</p>
              </div>
              <span className="whitespace-nowrap font-display text-2xl font-bold text-brand-700">{euro(forecast.taxReserveCents)}</span>
            </div>
            {!inApp && BANK_AAN && (
              <Link href="/dashboard/bank" className="btn-primary mt-4 inline-block text-sm">
                {t.taxCta}
              </Link>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-neutralx-200 bg-paper-soft p-5 text-sm text-neutralx-600">{t.payroll}</div>
        )}

        {/* trend */}
        <div className="rounded-2xl border border-neutralx-200 bg-white p-5">
          <h2 className="font-display text-lg font-semibold">{t.trendTitle}</h2>
          <p className="text-xs text-neutralx-500">{t.trendSub}</p>
          <div className="mt-5 flex items-end justify-between gap-2" style={{ height: 140 }}>
            {forecast.trend.map((p, i) => {
              const h = Math.max(4, Math.round((p.cents / maxTrend) * 116));
              const isCurrent = i === forecast.trend.length - 1;
              const label = ft.date.mon[p.month0] ?? p.label;
              return (
                <div key={p.ym} className="flex flex-1 flex-col items-center gap-1.5">
                  <span className="text-[10px] font-medium text-neutralx-500">{p.cents > 0 ? euro(p.cents) : ""}</span>
                  <div
                    className={`w-full rounded-t-md ${isCurrent ? "bg-brand-400" : "bg-brand-500"}`}
                    style={{ height: h }}
                    title={`${label}: ${euro(p.cents)}`}
                  />
                  <span className="text-[11px] text-neutralx-500">{label}</span>
                </div>
              );
            })}
          </div>
        </div>

        <p className="text-xs text-neutralx-400">
          {footBefore}
          <Link href="/dashboard/uitbetalingen" className="font-medium text-brand-600 hover:underline">
            {footLink}
          </Link>
          {footAfter}
        </p>
      </div>
    </>
  );
}

function Back({ label }: { label: string }) {
  return (
    <div className="mb-6">
      <Link href="/dashboard/account" className="text-sm font-medium text-neutralx-500 hover:text-brand-600">
        {label}
      </Link>
    </div>
  );
}
