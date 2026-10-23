import { allFunnelReports } from "@/lib/analytics/funnel";

/** Admin → Systeem: funnel-conversie met drop-off per stap (soeverein, cookievrij). */
export async function FunnelPanel({ months = 3 }: { months?: number }) {
  const funnels = await allFunnelReports(months).catch(() => []);
  return (
    <section className="mt-8 rounded-2xl border border-hair bg-white">
      <div className="border-b border-hair px-5 py-4">
        <h2 className="font-display text-base font-bold text-ink">Funnel & drop-off</h2>
        <p className="text-xs text-neutralx-500">Waar haken mensen af (laatste {months} maanden). Eigen tellers, geen externe dienst.</p>
      </div>
      <div className="grid gap-5 px-5 py-4 md:grid-cols-2">
        {funnels.map((f) => {
          const top = f.steps[0]?.count ?? 0;
          return (
            <div key={f.key}>
              <p className="text-sm font-semibold text-ink">{f.label}</p>
              <ul className="mt-2 space-y-1.5">
                {f.steps.map((s, i) => {
                  const widthOfTop = top > 0 ? Math.round((s.count / top) * 100) : 0;
                  return (
                    <li key={s.key}>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-ink">{s.label}</span>
                        <span className="font-mono text-neutralx-500">
                          {s.count}
                          {i > 0 && <span className={s.dropoff > 0.4 ? "ml-2 text-crit" : "ml-2 text-neutralx-400"}>−{Math.round(s.dropoff * 100)}%</span>}
                        </span>
                      </div>
                      <div className="mt-0.5 h-2 w-full rounded-full bg-paper-soft">
                        <div className="h-2 rounded-full bg-brand-500" style={{ width: `${widthOfTop}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
              {top === 0 && <p className="mt-1 text-xs text-neutralx-400">Nog geen data in deze periode.</p>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
