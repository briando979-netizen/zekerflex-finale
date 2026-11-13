import { leesSchijfreeks } from "@/lib/ops/schijfreeks-meting";
import { beoordeelSchijf } from "@/lib/ops/schijfreeks";
import { timeAgoNl } from "@/lib/admin/format";
import { Empty, Notice, Panel, Pill, Spark } from "@/components/admin/kit";

const GB = 1024 ** 3;
const gb = (bytes: number) => `${(bytes / GB).toFixed(1).replace(".", ",")} GB`;
const dagen = (d: number | null) => (d === null ? "geen groei gemeten" : d === 0 ? "al bereikt" : `ongeveer ${String(d).replace(".", ",")} dagen`);

/** Admin -> Systeem -> Taken: de schijf van de server, elk uur gemeten, de laatste 14 dagen (lib/ops/schijfreeks.ts). */
export async function SchijfreeksPanel() {
  const reeks = await leesSchijfreeks().catch(() => []);
  const b = beoordeelSchijf(reeks);
  const laatste = b.laatste;
  return (
    <Panel
      title="Schijf van de server"
      subtitle="Elk uur gemeten, de laatste 14 dagen. De groei per dag komt uit deze metingen (sinds de laatste opruiming)."
      actions={laatste ? <Pill tone={b.melding ? (b.melding.toon === "crit" ? "crit" : "warn") : "ok"}>{laatste.pct}% vol</Pill> : <Pill tone="neutral">Nog geen metingen</Pill>}
    >
      {!laatste ? (
        <Empty title="Nog geen metingen" body="Elk uur komt er een punt bij (de cron roept /api/internal/backup/check?alleen=schijf aan). Na een paar uur is er een groei te zien." />
      ) : (
        <div className="space-y-3">
          {b.melding ? <Notice tone={b.melding.toon === "crit" ? "crit" : "warn"} role="alert">{b.melding.tekst}</Notice> : null}
          <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2" style={{ color: "var(--a-text)" }}>
            <div><dt className="inline" style={{ color: "var(--a-mute)" }}>Laatste meting: </dt><dd className="inline">{gb(laatste.gebruikt)} van {gb(laatste.totaal)} ({laatste.pct}%), {timeAgoNl(new Date(laatste.t).toISOString())}</dd></div>
            <div><dt className="inline" style={{ color: "var(--a-mute)" }}>Groei per dag: </dt><dd className="inline">{b.groeiPerDagBytes === null ? "te weinig metingen" : `${b.groeiPerDagBytes >= 0 ? "+" : "-"}${gb(Math.abs(b.groeiPerDagBytes))}`}</dd></div>
            <div><dt className="inline" style={{ color: "var(--a-mute)" }}>Tot 85%: </dt><dd className="inline">{dagen(b.dagenTot85)}</dd></div>
            <div><dt className="inline" style={{ color: "var(--a-mute)" }}>Tot 95%: </dt><dd className="inline">{dagen(b.dagenTot95)}</dd></div>
          </dl>
          {reeks.length >= 2 ? (
            <div className="flex items-center gap-3">
              <Spark data={reeks.map((p) => p.pct)} width={220} height={36} />
              <span className="text-xs" style={{ color: "var(--a-mute)" }}>{b.punten} metingen</span>
            </div>
          ) : null}
        </div>
      )}
    </Panel>
  );
}