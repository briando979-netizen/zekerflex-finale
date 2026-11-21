import Link from "next/link";
import { PageHeader, KpiCard, Panel, EmptyState, moneyExact } from "@/components/app/ui";
import { BureauTabs, GeenUitzendPartner } from "@/components/werkgever/uitzend/BureauKop";
import { bureauContext, verloningVan } from "@/lib/uitzend/bureau";
import { recenteWeken, totalenPerWerker, weekGrenzen, weekTekst, weekVan } from "@/lib/uitzend/bureau-kern";

export const dynamic = "force-dynamic";

// /werkgever/uitzend/verloning — Uren voor verloning (21 nov 2026): de goedgekeurde uren van een week per uitzendkracht, en
// als CSV (één regel per dienst) voor het loonpakket van het bureau. Het bureau verloont zelf; ZekerFlex rekent alleen de
// platformvergoeding.

const uren = (minuten: number) => (minuten / 60).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function UitzendVerloningPage(props: { searchParams: Promise<{ week?: string }> }) {
  const ctx = await bureauContext();
  if (!ctx.tenantId || !ctx.partnerSinds) {
    return (
      <>
        <PageHeader eyebrow="Uitzendbureau" title="Uren voor verloning" />
        <GeenUitzendPartner />
      </>
    );
  }
  const nu = new Date();
  const gevraagd = (await props.searchParams).week ?? "";
  const week = weekGrenzen(gevraagd) ? gevraagd : weekVan(nu);
  const grenzen = weekGrenzen(week);
  const { diensten, wachten } = grenzen ? await verloningVan(ctx, grenzen.van, grenzen.tot) : { diensten: [], wachten: 0 };
  const totalen = totalenPerWerker(diensten);
  const minuten = totalen.reduce((n, t) => n + t.minuten, 0);
  const bruto = totalen.reduce((n, t) => n + t.brutoCents, 0);
  const weken = recenteWeken(nu, 8);

  return (
    <>
      <BureauTabs actief="verloning" />
      <PageHeader
        eyebrow="Uitzendbureau"
        title="Uren voor verloning"
        subtitle="De goedgekeurde uren per week, per uitzendkracht. Download ze voor je loonpakket: één regel per dienst."
        action={
          diensten.length > 0 ? (
            <a href={`/api/werkgever/uitzend/verloning?week=${week}`} className="btn-primary">
              Download Excel (CSV)
            </a>
          ) : undefined
        }
      />
      <nav aria-label="Week" className="mb-5 flex flex-wrap gap-2">
        {weken.map((w) => (
          <Link
            key={w}
            href={`/werkgever/uitzend/verloning?week=${w}`}
            aria-current={w === week ? "page" : undefined}
            className={`rounded-full border px-3 py-1 text-sm ${w === week ? "border-ink bg-ink text-white" : "border-hair bg-white text-neutralx-600 hover:text-ink"}`}
          >
            {weekTekst(w)}
          </Link>
        ))}
      </nav>
      {wachten > 0 && (
        <p role="status" className="mb-5 rounded-2xl border border-warn/30 bg-warn/[0.06] p-4 text-sm text-neutralx-700">
          {wachten === 1 ? "1 dienst" : `${wachten} diensten`} uit deze week {wachten === 1 ? "wacht" : "wachten"} nog op goedkeuring en {wachten === 1 ? "staat" : "staan"} hier nog niet bij.{" "}
          <Link href="/werkgever/uren" className="font-semibold text-brand-600 underline">
            Uren goedkeuren
          </Link>
        </p>
      )}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <KpiCard label="Uitzendkrachten" value={String(totalen.length)} />
        <KpiCard label="Uren" value={uren(minuten)} />
        <KpiCard label="Bruto volgens uurloon klus" value={moneyExact(bruto)} hint="vóór loonheffing en toeslagen" />
      </div>
      <Panel title={`Week ${week.slice(-2)}`} subtitle={weekTekst(week)}>
        {totalen.length === 0 ? (
          <EmptyState title="Geen goedgekeurde uren in deze week" body="Zodra je de uren van een dienst goedkeurt, staan ze hier." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-hair text-left text-xs text-neutralx-500">
                  <th className="px-5 py-2 font-medium">Uitzendkracht</th>
                  <th className="px-3 py-2 font-medium">Klant of locatie</th>
                  <th className="px-3 py-2 text-right font-medium">Diensten</th>
                  <th className="px-3 py-2 text-right font-medium">Uren</th>
                  <th className="px-5 py-2 text-right font-medium">Bruto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hair">
                {totalen.map((t) => (
                  <tr key={t.werkerId}>
                    <td className="px-5 py-3">
                      <p className="font-medium text-ink">{t.naam}</p>
                      <p className="text-xs text-neutralx-500">{t.email}</p>
                    </td>
                    <td className="px-3 py-3 text-neutralx-700">{t.locaties.join(", ")}</td>
                    <td className="num px-3 py-3 text-right">{t.diensten}</td>
                    <td className="num px-3 py-3 text-right">{uren(t.minuten)}</td>
                    <td className="num px-5 py-3 text-right font-semibold text-ink">{moneyExact(t.brutoCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <p className="mt-4 text-sm text-neutralx-500">Bruto is uren keer het uurloon dat bij de dienst stond. Toeslagen, reiskosten en loonheffing reken je in je eigen loonpakket.</p>
    </>
  );
}
