import Link from "next/link";
import { Panel } from "@/components/admin/kit";
import { oordeel, type AutomatiseringStand } from "@/lib/sales/automatisering";

// "Gaat het automatisch?": de eerlijke stand van de sales-motor bovenaan Beheer → Sales (zie lib/sales/automatisering.ts).

const KLEUR = { ok: "var(--a-ok)", "let-op": "var(--a-warn)", stil: "var(--a-crit)" } as const;

const dag = new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function AutomatischPaneel({ stand }: { stand: AutomatiseringStand }) {
  const o = oordeel(stand);
  const l = stand.leads;
  const stappen: { label: string; waarde: number }[] = [
    { label: "Open leads", waarde: l.open },
    { label: "Nog niet gescoord", waarde: l.zonderScore },
    { label: "Zonder e-mail", waarde: l.zonderMail },
    { label: "Zonder vacaturesignaal", waarde: l.zonderVacature },
    { label: "Klaar voor een mail", waarde: l.klaarVoorConcept },
    { label: "Wacht op jouw goedkeuring", waarde: stand.wachtOpJou },
  ];
  return (
    <Panel title="Gaat het automatisch?" subtitle="Wat de motor zelf doet en waar het op wacht">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--a-text)" }}>
            <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: KLEUR[o.niveau] }} />
            {o.kop}
          </p>
          <ul className="mt-2 space-y-1.5 text-[0.8125rem] leading-snug" style={{ color: "var(--a-dim)" }}>
            {o.regels.map((r) => (
              <li key={r} className="break-words">{r}</li>
            ))}
          </ul>
          <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" style={{ color: "var(--a-mute)" }}>
            <span>
              Laatste ronde: {stand.laatsteRun ? `${dag.format(new Date(stand.laatsteRun.op))}${stand.laatsteRun.samenvatting ? ` · ${stand.laatsteRun.samenvatting}` : ""}` : "nog niet gedraaid"}
            </span>
            <Link href="/admin/sales?weergave=campagnes" className="font-medium underline" style={{ color: "var(--a-text)" }}>
              Campagnes en automatisch versturen
            </Link>
          </p>
        </div>
        <dl className="grid min-w-0 grid-cols-2 gap-2 self-start">
          {stappen.map((s) => (
            <div key={s.label} className="min-w-0 rounded-lg px-3 py-2" style={{ background: "var(--a-panel-2)", border: "1px solid var(--a-border)" }}>
              <dd className="num text-lg font-semibold" style={{ color: "var(--a-text)" }}>{s.waarde}</dd>
              <dt className="text-[11px] leading-tight" style={{ color: "var(--a-mute)" }}>{s.label}</dt>
            </div>
          ))}
        </dl>
      </div>
    </Panel>
  );
}
