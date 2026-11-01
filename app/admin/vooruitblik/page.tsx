import Link from "next/link";
import { getPrincipal, hasRole } from "@/lib/auth";
import { forecastInsights } from "@/lib/admin/insights/forecast";
import { count, dateNl } from "@/lib/admin/format";
import { BarList, KpiStrip, PageHead, Panel, Pill } from "@/components/admin/kit";
import { Chart, DataTable, type TableRow } from "@/components/admin/kit-client";

export const dynamic = "force-dynamic";

const dec = (n: number) => n.toLocaleString("nl-NL", { maximumFractionDigits: 1 });

const ACTIONS = [
  { href: "/admin/recruiter", title: "Kandidaten benaderen", body: "Zoek in je eigen pool en stuur een persoonlijk bericht." },
  { href: "/admin/uitzendbureau", title: "Uitzendkrachten bekijken", body: "Wie is er beschikbaar en waar loopt een contractgrens?" },
  { href: "/admin/sales", title: "Bedrijven benaderen", body: "Is het rustig? Vul de vraag aan via de pijplijn." },
];

export default async function AdminVooruitblikPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="De vooruitblik is alleen voor platformbeheerders." />;
  }
  const d = await forecastInsights();
  const { forecast } = d;
  const trend = forecast.trend;
  const hasHistory = forecast.sampleShifts > 0;

  const rows: TableRow[] = d.days.map((day) => {
    const gap = Math.max(0, Math.round(day.expectedPositions - day.planned));
    return {
      id: day.date,
      cells: {
        day: <span className="font-medium" style={{ color: "var(--a-text)" }}>{dateNl(`${day.date}T12:00:00Z`, { weekday: "long", day: "numeric", month: "short" })}</span>,
        expected: dec(day.expectedPositions),
        planned: count(day.planned),
        filled: count(day.filled),
        gap: gap > 0 ? <Pill tone="warn">{gap} nog niet gepland</Pill> : <Pill tone="ok">Gedekt</Pill>,
      },
    };
  });

  return (
    <div className="space-y-4">
      <PageHead
        title="Vooruitblik"
        subtitle="Een statistische verwachting van de drukte voor de komende week, berekend uit je eigen klussen. Zo werf of benader je kandidaten vóór de piek."
      />

      <KpiStrip
        items={[
          { label: "Verwachte plekken", value: dec(d.expected), hint: "komende 7 dagen" },
          { label: "Al gepland", value: count(d.planned), hint: `${count(d.filled)} ingevuld` },
          { label: "Drukste dag", value: forecast.busiestWeekday ?? "—", hint: hasHistory ? "op basis van je historie" : "nog te weinig historie" },
          { label: "Deze week", value: trend ? (trend.pct === null ? "Nieuw" : trend.direction === "flat" ? "Gelijk" : trend.direction === "up" ? "Drukker" : "Rustiger") : "—", delta: trend?.pct ?? null, hint: "t.o.v. vorige week" },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Panel
          title="Verwachting en planning"
          subtitle="Plekken per dag, de komende 7 dagen"
          footer={hasHistory ? `Op basis van ${count(forecast.sampleShifts)} klussen uit ${forecast.windowWeeks} ${forecast.windowWeeks === 1 ? "week" : "weken"}. Een schatting per weekdag, geen garantie.` : "Nog te weinig historie voor een betrouwbare verwachting. Dit vult zich vanzelf naarmate er klussen geweest zijn."}
        >
          <Chart
            title="Verwachte en geplande plekken per dag"
            kind="line"
            unit="count"
            labels={d.days.map((day) => day.date)}
            series={[
              { label: "Verwacht", values: d.days.map((day) => day.expectedPositions), slot: 1 },
              { label: "Al gepland", values: d.days.map((day) => day.planned), slot: 3 },
            ]}
            height={230}
            emptyText="Nog geen verwachting beschikbaar."
          />
        </Panel>
        <Panel title="Drukte per weekdag" subtitle={`Plekken in de afgelopen ${forecast.windowWeeks} ${forecast.windowWeeks === 1 ? "week" : "weken"}`}>
          <BarList rows={d.weekdays.map((w) => ({ key: w.label, label: <span className="capitalize">{w.label}</span>, value: w.value, display: count(w.value) }))} />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel flush title="Per dag" subtitle="Waar de verwachting hoger is dan wat er gepland staat">
          <DataTable
            columns={[
              { key: "day", label: "Dag", sortable: false },
              { key: "expected", label: "Verwacht", align: "right", sortable: false },
              { key: "planned", label: "Gepland", align: "right", sortable: false },
              { key: "filled", label: "Ingevuld", align: "right", sortable: false, hideOnMobile: true },
              { key: "gap", label: "", align: "right", sortable: false },
            ]}
            rows={rows}
          />
        </Panel>
        <div className="space-y-4">
          <Panel title="Plekken per week" subtitle={`De afgelopen ${d.weekLabels.length} weken, per begin van de week`}>
            <Chart title="Aantal plekken per week" kind="bars" unit="count" labels={d.weekLabels} series={[{ label: "Plekken", values: d.weekValues, slot: 1 }]} height={150} emptyText="Nog geen klussen in deze weken." />
          </Panel>
          <Panel flush title="Wat je nu kunt doen">
            <ul>
              {ACTIONS.map((a) => (
                <li key={a.href} style={{ borderTop: "1px solid var(--a-border)" }}>
                  <Link href={a.href} className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--a-panel-2)] sm:px-5">
                    <span className="min-w-0">
                      <span className="block text-[0.8125rem] font-medium" style={{ color: "var(--a-text)" }}>{a.title}</span>
                      <span className="block text-xs" style={{ color: "var(--a-mute)" }}>{a.body}</span>
                    </span>
                    <span aria-hidden style={{ color: "var(--a-mute)" }}>→</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
