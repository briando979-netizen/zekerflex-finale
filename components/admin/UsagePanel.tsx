import { Panel } from "@/components/app/ui";
import { usageSnapshot, type RouteUsage } from "@/lib/ops/usage";

function Table({ rows, empty }: { rows: RouteUsage[]; empty: string }) {
  if (!rows.length) return <p className="px-5 py-4 text-sm text-neutralx-500">{empty}</p>;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-neutralx-500">
          <th className="px-5 py-2 font-medium">Route</th>
          <th className="px-3 py-2 text-right font-medium">Aanroepen</th>
          <th className="px-3 py-2 text-right font-medium">Gem.</th>
          <th className="px-3 py-2 text-right font-medium">Max</th>
          <th className="px-5 py-2 text-right font-medium">Fouten</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.name} className="border-t border-hair">
            <td className="px-5 py-2">{r.name}</td>
            <td className="px-3 py-2 text-right">{r.calls.toLocaleString("nl-NL")}</td>
            <td className={`px-3 py-2 text-right ${r.avgMs > 2000 ? "text-crit" : r.avgMs > 800 ? "text-warn" : ""}`}>{r.avgMs} ms</td>
            <td className="px-3 py-2 text-right">{r.maxMs} ms</td>
            <td className={`px-5 py-2 text-right ${r.errors ? "text-crit" : ""}`}>{r.errors}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Admin → Systeemstatus: what costs money / time on Vercel, Neon and Redis. */
export async function UsagePanel() {
  const u = await usageSnapshot();
  return (
    <div className="mt-6 space-y-6">
      {u.warnings.length > 0 && (
        <div className="rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-neutralx-700">
          <p className="font-semibold text-ink">Let op</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {u.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Snelheid — vandaag" subtitle="de drukste routes; elke aanroep is een betaalde functie-aanroep op Vercel">
          <Table rows={u.today} empty="Nog geen aanroepen gemeten vandaag." />
        </Panel>
        <Panel title="Afgelopen 7 dagen" subtitle="zelfde routes, opgeteld">
          <Table rows={u.week} empty="Nog geen metingen." />
        </Panel>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Database (Postgres)" subtitle={u.db ? `${u.db.totalMb} MB in totaal — de grootste tabellen` : "niet uit te lezen"}>
          {u.db && (
            <ul className="divide-y divide-hair text-sm">
              {u.db.tables.map((t) => (
                <li key={t.name} className="flex justify-between px-5 py-2">
                  <span className="font-mono text-xs">{t.name}</span>
                  <span className="text-neutralx-600">
                    {t.mb} MB · ±{t.rows.toLocaleString("nl-NL")} rijen
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Redis" subtitle="live tellers, cache, bezoekersmeting">
          <p className="px-5 py-4 text-sm text-neutralx-700">
            {u.redis ? (
              <>
                {u.redis.usedMb} MB geheugen · {u.redis.keys.toLocaleString("nl-NL")} sleutels
              </>
            ) : (
              "Niet uit te lezen."
            )}
          </p>
          <p className="px-5 pb-4 text-xs text-neutralx-500">
            Tip: de chat- en belcontrole worden door elke open app om de paar seconden opgevraagd — dat zijn meestal de grootste posten in &ldquo;Aanroepen&rdquo;.
          </p>
        </Panel>
      </div>
    </div>
  );
}
