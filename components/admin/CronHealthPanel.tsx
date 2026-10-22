import { cronHeartbeats } from "@/lib/ops/heartbeat";

const rel = (iso: string): string => {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return `${Math.max(1, Math.floor(ms / 60_000))} min geleden`;
  if (h < 48) return `${h} uur geleden`;
  return `${Math.floor(h / 24)} dagen geleden`;
};

/** Admin → Systeem: durable "did every scheduled job run?" readout, independent of prom-client. */
export async function CronHealthPanel() {
  const health = await cronHeartbeats().catch(() => []);
  const stale = health.filter((h) => h.stale).length;
  return (
    <section className="mt-8 rounded-2xl border border-hair bg-white">
      <div className="flex items-center justify-between border-b border-hair px-5 py-4">
        <div>
          <h2 className="font-display text-base font-bold text-ink">Geplande taken</h2>
          <p className="text-xs text-neutralx-500">
            Duurzame hartslag per cron. {stale === 0 ? "Alles draait op schema." : `${stale} taak/taken draait niet op tijd — de beheerders zijn gewaarschuwd.`}
          </p>
        </div>
        {stale === 0 ? (
          <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">OK</span>
        ) : (
          <span className="rounded-full bg-crit/10 px-3 py-1 text-xs font-semibold text-crit">{stale} probleem</span>
        )}
      </div>
      <ul className="divide-y divide-hair">
        {health.map((h) => (
          <li key={h.job} className="flex items-center justify-between px-5 py-3">
            <span className="min-w-0">
              <span className="text-sm font-medium text-ink">{h.label}</span>
              <span className="block font-mono text-[11px] text-neutralx-400">{h.job}</span>
            </span>
            <span className="flex items-center gap-3 text-right">
              <span className="text-xs text-neutralx-500">
                {h.lastRunAt ? rel(h.lastRunAt) : "nog niet gezien"}
                {h.lastRunOk === false && <span className="ml-1 text-crit">(laatste run mislukt)</span>}
              </span>
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${h.stale ? "bg-crit" : "bg-brand-500"}`} aria-label={h.stale ? "te laat" : "op schema"} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
