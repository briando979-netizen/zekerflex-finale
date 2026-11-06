import { getApiMetrics, getSlowQueries } from "@/lib/perf/metrics";
import { Panel, Pill } from "@/components/admin/kit";

export async function PerformancePanel() {
  const slowQueries = await getSlowQueries();
  const avgMs = slowQueries.length ? Math.round(slowQueries.reduce((s, q) => s + q.ms, 0) / slowQueries.length) : 0;

  return (
    <Panel title="Prestatie" subtitle={`${slowQueries.length} trage queries gemiddeld ${avgMs}ms`}>
      <ul className="max-h-64 overflow-y-auto">
        {slowQueries.slice(-5).map((q, i) => (
          <li key={i} className="px-4 py-2 text-xs border-t" style={{ borderColor: "var(--a-border)" }}>
            <span style={{ color: "var(--a-mute)" }}>{q.ms}ms</span> — {q.query.slice(0, 60)}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
