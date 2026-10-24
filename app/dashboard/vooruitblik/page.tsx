import Link from "next/link";
import { requirePrincipal } from "@/lib/auth";
import { PageHeader, EmptyState } from "@/components/app/ui";
import { getEarningsForecast } from "@/lib/dashboard/earnings-forecast";
import { inAndroidApp } from "@/lib/app-mode-server";

export const dynamic = "force-dynamic";

function euro(cents: number): string {
  return `€ ${Math.round(cents / 100).toLocaleString("nl-NL")}`;
}

export default async function VooruitblikPage() {
  const principal = await requirePrincipal();
  const [forecast, inApp] = await Promise.all([getEarningsForecast(principal.userId), inAndroidApp()]);

  if (!forecast) {
    return (
      <>
        <Back />
        <PageHeader title="Loon-vooruitblik" subtitle="Wat je deze maand verdient en wat je opzij kunt zetten." />
        <EmptyState title="Nog geen profiel" body="De vooruitblik verschijnt zodra je als professional diensten hebt." />
      </>
    );
  }

  const maxTrend = Math.max(1, ...forecast.trend.map((t) => t.cents));
  const workedPct = forecast.expectedCents > 0 ? Math.round((forecast.workedCents / forecast.expectedCents) * 100) : 0;

  return (
    <>
      <Back />
      <PageHeader
        title="Loon-vooruitblik"
        subtitle={`Een eerlijke schatting van je bruto verdiensten in ${forecast.monthLabel}, op basis van je agenda.`}
      />

      <div className="space-y-6">
        {/* deze maand */}
        <div className="rounded-2xl border border-neutralx-200 bg-white p-5">
          <p className="text-xs uppercase tracking-wide text-neutralx-400">Verwacht deze maand (bruto)</p>
          <p className="mt-1 font-display text-4xl font-bold text-brand-600">{euro(forecast.expectedCents)}</p>

          {forecast.expectedCents > 0 && (
            <>
              <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-neutralx-200">
                <div className="h-full rounded-full bg-brand-500" style={{ width: `${workedPct}%` }} />
              </div>
              <div className="mt-2 flex justify-between text-xs text-neutralx-500">
                <span>✓ Al gewerkt: <strong className="text-ink">{euro(forecast.workedCents)}</strong></span>
                <span>Nog gepland: <strong className="text-ink">{euro(forecast.plannedCents)}</strong>{forecast.upcomingCount > 0 ? ` (${forecast.upcomingCount})` : ""}</span>
              </div>
            </>
          )}
          {forecast.expectedCents === 0 && (
            <p className="mt-2 text-sm text-neutralx-500">Nog geen diensten deze maand. Reageer op klussen om je vooruitblik te vullen.</p>
          )}
        </div>

        {/* belasting-potje (alleen zzp/flex) */}
        {!forecast.isPayroll ? (
          <div className="rounded-2xl border border-brand-100 bg-brand-50/50 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-lg font-semibold">🧾 Zet opzij voor de Belastingdienst</h2>
                <p className="mt-1 text-sm text-neutralx-600">
                  Vuistregel: ongeveer <strong>{forecast.taxPct}%</strong> van je verdiensten. Geen belastingadvies —
                  je past het percentage zelf aan in je Belasting-potje.
                </p>
              </div>
              <span className="whitespace-nowrap font-display text-2xl font-bold text-brand-700">{euro(forecast.taxReserveCents)}</span>
            </div>
            {!inApp && (
              <Link href="/dashboard/bank" className="btn-primary mt-4 inline-block text-sm">
                Zet opzij in je Belasting-potje →
              </Link>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-neutralx-200 bg-paper-soft p-5 text-sm text-neutralx-600">
            Als uitzendkracht hoef je zelf niets voor de belasting opzij te zetten — de loonheffing wordt al automatisch
            op je loon ingehouden. Je nettoloon staat op je loonstrook.
          </div>
        )}

        {/* trend */}
        <div className="rounded-2xl border border-neutralx-200 bg-white p-5">
          <h2 className="font-display text-lg font-semibold">Verdiensten per maand</h2>
          <p className="text-xs text-neutralx-500">Bruto, uit je werkagenda (deze maand = projectie).</p>
          <div className="mt-5 flex items-end justify-between gap-2" style={{ height: 140 }}>
            {forecast.trend.map((t, i) => {
              const h = Math.max(4, Math.round((t.cents / maxTrend) * 116));
              const isCurrent = i === forecast.trend.length - 1;
              return (
                <div key={t.ym} className="flex flex-1 flex-col items-center gap-1.5">
                  <span className="text-[10px] font-medium text-neutralx-500">{t.cents > 0 ? euro(t.cents) : ""}</span>
                  <div
                    className={`w-full rounded-t-md ${isCurrent ? "bg-brand-400" : "bg-brand-500"}`}
                    style={{ height: h }}
                    title={`${t.label}: ${euro(t.cents)}`}
                  />
                  <span className="text-[11px] text-neutralx-500">{t.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        <p className="text-xs text-neutralx-400">
          Dit is een schatting op basis van ingeplande diensten (uren × tarief, min pauze). Je exacte uitbetalingen en
          facturen vind je bij{" "}
          <Link href="/dashboard/uitbetalingen" className="font-medium text-brand-600 hover:underline">Uitbetalingen</Link>.
        </p>
      </div>
    </>
  );
}

function Back() {
  return (
    <div className="mb-6">
      <Link href="/dashboard/account" className="text-sm font-medium text-neutralx-500 hover:text-brand-600">
        ← Terug
      </Link>
    </div>
  );
}
