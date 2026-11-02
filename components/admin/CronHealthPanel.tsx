import { cronHeartbeats } from "@/lib/ops/heartbeat";
import { timeAgoNl } from "@/lib/admin/format";
import { Panel, Pill } from "@/components/admin/kit";

/** Admin → Systeem: durable "did every scheduled job run?" readout, independent of prom-client. */
export async function CronHealthPanel() {
  const health = await cronHeartbeats().catch(() => []);
  const stale = health.filter((h) => h.stale).length;
  return (
    <Panel
      flush
      title="Geplande taken"
      subtitle={stale === 0 ? "Duurzame hartslag per taak. Alles draait op schema." : `${stale} ${stale === 1 ? "taak draait" : "taken draaien"} niet op tijd. De beheerders zijn gewaarschuwd.`}
      actions={<Pill tone={stale === 0 ? "ok" : "crit"}>{stale === 0 ? "Op schema" : `${stale} te laat`}</Pill>}
    >
      <ul>
        {health.map((h) => (
          <li key={h.job} className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5" style={{ borderTop: "1px solid var(--a-border)" }}>
            <span className="min-w-0">
              <span className="block text-[0.8125rem] font-medium" style={{ color: "var(--a-text)" }}>{h.label}</span>
              <span className="block font-mono text-[0.6875rem]" style={{ color: "var(--a-mute)" }}>{h.job}</span>
            </span>
            <span className="flex flex-shrink-0 items-center gap-3">
              <span className="text-xs" style={{ color: "var(--a-mute)" }}>{h.lastRunAt ? timeAgoNl(h.lastRunAt) : "nog niet gezien"}</span>
              {h.lastRunOk === false ? <Pill tone="crit">Laatste run mislukt</Pill> : <Pill tone={h.stale ? "crit" : h.lastRunAt ? "ok" : "neutral"}>{h.stale ? "Te laat" : h.lastRunAt ? "Op schema" : "Wacht"}</Pill>}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
