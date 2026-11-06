"use client";

import { useCallback, useEffect, useState } from "react";
import { count, euro, euroExact } from "@/lib/admin/format";
import { BarList, KpiStrip, Notice, Panel, Pill, type Tone } from "@/components/admin/kit";
import { DataTable, type TableRow } from "@/components/admin/kit-client";

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

const STATUS: Record<Opgave["status"], { label: string; tone: Tone }> = {
  geleverd: { label: "Geleverd", tone: "ok" },
  mislukt: { label: "Mislukt", tone: "crit" },
  concept: { label: "Concept", tone: "warn" },
};

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
  useEffect(() => {
    void load();
  }, [load]);

  if (!d) return <div className="a-panel h-28 animate-pulse" />;
  const o = d.opgave;
  const status = STATUS[o.status];

  const byCountry = new Map<string, number>();
  for (const l of o.lines) byCountry.set(l.land, (byCountry.get(l.land) ?? 0) + l.nettoCents);

  const rows: TableRow[] = o.lines.map((l) => ({
    id: l.vatId ?? l.afnemer,
    search: `${l.afnemer} ${l.vatId ?? ""} ${l.land}`,
    filters: { land: l.land },
    cells: {
      name: <span className="font-medium" style={{ color: "var(--a-text)" }}>{l.afnemer}</span>,
      vat: l.vatId ? <span className="font-mono text-xs">{l.vatId}</span> : <Pill tone="crit">Ontbreekt</Pill>,
      land: l.land,
      netto: <span className="font-medium" style={{ color: "var(--a-text)" }}>{euroExact(l.nettoCents)}</span>,
      facturen: count(l.facturen),
    },
    sort: { name: l.afnemer, land: l.land, netto: l.nettoCents, facturen: l.facturen },
  }));

  return (
    <div className="space-y-4">
      <section className="a-panel flex flex-wrap items-center gap-3 p-3 sm:px-5">
        <label className="flex items-center gap-2 text-[0.8125rem] font-medium" style={{ color: "var(--a-text)" }}>
          Kwartaal
          <select value={period ?? ""} onChange={(e) => { setPeriod(e.target.value); setMsg(null); load(e.target.value); }} className="a-input !w-auto !py-1 text-[0.8125rem]">
            {d.periods.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <Pill tone={status.tone}>{status.label}</Pill>
        <span className="ml-auto flex flex-wrap gap-1.5">
          <a href={`/api/admin/icp/${period}/export`} className="a-button text-xs">Download CSV</a>
          <button
            type="button"
            disabled={busy || o.lines.length === 0}
            onClick={async () => {
              if (!window.confirm(`ICP-opgave ${o.label} leveren?`)) return;
              setBusy(true);
              setMsg(null);
              try {
                const r = await fetch(`/api/admin/icp/${period}/deliver`, { method: "POST" });
                const res = await r.json();
                setMsg(res.detail);
                load(period ?? undefined);
              } finally {
                setBusy(false);
              }
            }}
            className="a-button a-button-primary text-xs"
          >
            {busy ? "Leveren…" : "Leveren"}
          </button>
        </span>
      </section>

      {!d.deliveryConfigured && <Notice>Nog geen automatisch leverkanaal (ICP_ENDPOINT). Download de CSV en dien in via Mijn Belastingdienst Zakelijk.</Notice>}
      {msg && <Notice tone="ok">{msg}</Notice>}
      {o.leveringDetail && <Notice>{o.leveringDetail}</Notice>}
      {o.totals.incompleet > 0 && <Notice tone="crit" role="alert">{o.totals.incompleet} afnemer(s) missen een btw-id. Die kunnen niet geleverd worden.</Notice>}

      <KpiStrip
        items={[
          { label: "Netto verlegd", value: euro(o.totals.nettoCents), hint: o.label, tone: "money" },
          { label: "Afnemers", value: count(o.totals.afnemers), hint: `${count(byCountry.size)} ${byCountry.size === 1 ? "land" : "landen"}` },
          { label: "Facturen", value: count(o.totals.facturen), hint: "met verlegde btw" },
          { label: "Zonder btw-id", value: count(o.totals.incompleet), hint: o.totals.incompleet > 0 ? "kunnen niet geleverd worden" : "alles compleet", ...(o.totals.incompleet > 0 ? { tone: "crit" as const } : {}) },
        ]}
      />

      <div className="grid items-start gap-4 lg:grid-cols-[1fr_2fr]">
        <Panel title="Per land">
          <BarList emptyText="Geen prestaties in dit kwartaal." rows={[...byCountry.entries()].sort((a, b) => b[1] - a[1]).map(([land, cents]) => ({ key: land, label: land, value: cents, display: euro(cents) }))} />
        </Panel>
        <Panel flush title="Afnemers" subtitle={o.label}>
          <DataTable
            columns={[
              { key: "name", label: "Afnemer" },
              { key: "vat", label: "Btw-id", sortable: false },
              { key: "land", label: "Land", hideOnMobile: true },
              { key: "netto", label: "Netto", align: "right" },
              { key: "facturen", label: "Facturen", align: "right", hideOnMobile: true },
            ]}
            rows={rows}
            pageSize={15}
            searchPlaceholder="Zoek een afnemer"
            defaultSort={{ key: "netto", dir: "desc" }}
            emptyText="Geen intracommunautaire prestaties in dit kwartaal."
          />
        </Panel>
      </div>
    </div>
  );
}
