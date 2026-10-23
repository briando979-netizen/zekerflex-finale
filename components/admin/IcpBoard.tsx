"use client";

import { useCallback, useEffect, useState } from "react";

interface Line {
  vatId: string | null;
  land: string;
  afnemer: string;
  nettoCents: number;
  facturen: number;
  compleet: boolean;
}
interface Opgave {
  period: string;
  label: string;
  status: "concept" | "geleverd" | "mislukt";
  leveringDetail: string | null;
  lines: Line[];
  totals: { afnemers: number; incompleet: number; nettoCents: number; facturen: number };
}
interface Data {
  periods: string[];
  opgave: Opgave;
  deliveryConfigured: boolean;
}

const eur = (c: number) => `€ ${(c / 100).toFixed(2).replace(".", ",")}`;

/** Admin → ICP: intracommunautaire prestaties (btw-verlegd) per kwartaal. */
export function IcpBoard() {
  const [d, setD] = useState<Data | null>(null);
  const [period, setPeriod] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback((p?: string) => {
    fetch(`/api/admin/icp${p ? `?period=${p}` : ""}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Data | null) => {
        if (!data) return;
        setD(data);
        setPeriod(data.opgave.period);
      })
      .catch(() => undefined);
  }, []);
  useEffect(() => load(), [load]);

  if (!d) return <p className="text-sm text-neutralx-500">Laden…</p>;
  const o = d.opgave;
  const badge = o.status === "geleverd" ? "bg-brand-50 text-brand-700" : o.status === "mislukt" ? "bg-crit/10 text-crit" : "bg-paper-soft text-neutralx-600";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-hair bg-white px-5 py-4">
        <label className="text-sm text-neutralx-600">
          Kwartaal{" "}
          <select value={period ?? ""} onChange={(e) => { setPeriod(e.target.value); setMsg(null); load(e.target.value); }} className="field-input ml-1 w-auto py-1.5 text-sm">
            {d.periods.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </label>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badge}`}>{o.status}</span>
        <span className="ml-auto flex gap-2">
          <a href={`/api/admin/icp/${period}/export`} className="rounded-full border border-hairstrong px-3 py-1.5 text-xs font-semibold text-ink hover:bg-paper-soft">Download CSV</a>
          <button type="button" disabled={busy || o.lines.length === 0} onClick={async () => {
            if (!window.confirm(`ICP-opgave ${o.label} leveren?`)) return;
            setBusy(true); setMsg(null);
            try { const r = await fetch(`/api/admin/icp/${period}/deliver`, { method: "POST" }); const res = await r.json(); setMsg(res.detail); load(period ?? undefined); } finally { setBusy(false); }
          }} className="btn-primary px-4 py-1.5 text-xs disabled:opacity-50">{busy ? "Leveren…" : "Leveren"}</button>
        </span>
      </div>

      {!d.deliveryConfigured && (
        <p className="rounded-lg bg-paper-soft px-4 py-3 text-xs text-neutralx-700">Nog geen automatisch leverkanaal (<code>ICP_ENDPOINT</code>). Download de CSV en dien in via Mijn Belastingdienst Zakelijk.</p>
      )}
      {msg && <p className="rounded-lg bg-brand-50 px-4 py-2 text-sm text-brand-800">{msg}</p>}
      {o.leveringDetail && <p className="text-xs text-neutralx-500">{o.leveringDetail}</p>}

      <div className="grid gap-3 sm:grid-cols-3">
        {[["Afnemers", String(o.totals.afnemers)], ["Netto verlegd", eur(o.totals.nettoCents)], ["Facturen", String(o.totals.facturen)]].map(([k, v]) => (
          <div key={k} className="rounded-xl border border-hair bg-white px-4 py-3"><p className="text-xs text-neutralx-500">{k}</p><p className="font-display text-lg font-bold text-ink">{v}</p></div>
        ))}
      </div>

      {o.totals.incompleet > 0 && <p className="rounded-lg bg-crit/10 px-4 py-2 text-sm text-crit">{o.totals.incompleet} afnemer(s) missen een btw-id — die kunnen niet geleverd worden.</p>}

      <div className="overflow-x-auto rounded-2xl border border-hair bg-white">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="text-xs text-neutralx-500"><tr>
            <th className="px-4 py-2 font-medium">Afnemer</th><th className="px-4 py-2 font-medium">Btw-id</th><th className="px-4 py-2 font-medium">Land</th><th className="px-4 py-2 font-medium">Netto</th><th className="px-4 py-2 font-medium">Facturen</th>
          </tr></thead>
          <tbody className="divide-y divide-hair">
            {o.lines.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-neutralx-500">Geen intracommunautaire prestaties in dit kwartaal.</td></tr>
            ) : o.lines.map((l) => (
              <tr key={(l.vatId ?? l.afnemer)}>
                <td className="px-4 py-2 font-medium text-ink">{l.afnemer}</td>
                <td className="px-4 py-2 text-xs">{l.vatId ?? <span className="text-crit">ontbreekt</span>}</td>
                <td className="px-4 py-2">{l.land}</td>
                <td className="px-4 py-2">{eur(l.nettoCents)}</td>
                <td className="px-4 py-2">{l.facturen}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
