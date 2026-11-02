"use client";

import { useCallback, useEffect, useState } from "react";
import { count, euroExact, percentOf } from "@/lib/admin/format";
import { KpiStrip, Meter, Notice, Panel, Pill, StackBar, type Tone } from "@/components/admin/kit";
import { DataTable, type TableRow } from "@/components/admin/kit-client";

interface Line {
  naam: string;
  bsnOpDossier: boolean;
  bsnLaatste4: string | null;
  regeling: "basis" | "plus";
  fase: string;
  wekenGewerkt: number;
  uren: number;
  pensioengevendLoonCents: number;
  werknemerPremieCents: number;
  werkgeverPremieCents: number;
  totaalPremieCents: number;
  compleet: boolean;
  ontbreekt: string[];
}
interface Aangifte {
  period: string;
  label: string;
  uitvoerder: string;
  aansluitnummer: string | null;
  status: "concept" | "geleverd" | "mislukt";
  geleverdOp: string | null;
  leveringDetail: string | null;
  lines: Line[];
  totals: { werknemers: number; incompleet: number; uren: number; pensioengevendLoonCents: number; werknemerPremieCents: number; werkgeverPremieCents: number; totaalPremieCents: number };
}
interface Data {
  periods: string[];
  aangifte: Aangifte;
  deliveryConfigured: boolean;
}

const STATUS: Record<Aangifte["status"], { label: string; tone: Tone }> = {
  geleverd: { label: "Geleverd", tone: "ok" },
  mislukt: { label: "Mislukt", tone: "crit" },
  concept: { label: "Concept", tone: "warn" },
};

/** Admin → Pensioen: de maandelijkse StiPP-aangifte (UPA) voor de uitzendtak. */
export function PensioenBoard() {
  const [d, setD] = useState<Data | null>(null);
  const [period, setPeriod] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback((p?: string) => {
    const q = p ? `?period=${p}` : "";
    fetch(`/api/admin/pensioen${q}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Data | null) => {
        if (!data) return;
        setD(data);
        setPeriod(data.aangifte.period);
      })
      .catch(() => undefined);
  }, []);
  useEffect(() => load(), [load]);

  if (!d) return <div className="a-panel h-28 animate-pulse" />;
  const a = d.aangifte;
  const status = STATUS[a.status];

  const rows: TableRow[] = a.lines.map((l) => ({
    id: l.naam,
    search: l.naam,
    filters: { complete: l.compleet ? "yes" : "no" },
    cells: {
      name: <span className="font-medium" style={{ color: "var(--a-text)" }}>{l.naam}</span>,
      bsn: l.bsnOpDossier ? <span className="font-mono text-xs">…{l.bsnLaatste4 ?? ""}</span> : <Pill tone="crit">Ontbreekt</Pill>,
      regeling: <span className="capitalize">{l.regeling}</span>,
      fase: l.fase,
      uren: l.uren.toLocaleString("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
      loon: euroExact(l.pensioengevendLoonCents),
      wn: euroExact(l.werknemerPremieCents),
      wg: euroExact(l.werkgeverPremieCents),
      status: l.compleet ? <Pill tone="ok">Compleet</Pill> : <Pill tone="crit">{l.ontbreekt.join(", ")}</Pill>,
    },
    sort: { name: l.naam, regeling: l.regeling, fase: l.fase, uren: l.uren, loon: l.pensioengevendLoonCents, wn: l.werknemerPremieCents, wg: l.werkgeverPremieCents, status: l.compleet ? 1 : 0 },
  }));

  return (
    <div className="space-y-4">
      <section className="a-panel flex flex-wrap items-center gap-3 p-3 sm:px-5">
        <label className="flex items-center gap-2 text-[0.8125rem] font-medium" style={{ color: "var(--a-text)" }}>
          Tijdvak
          <select
            value={period ?? ""}
            onChange={(e) => {
              setPeriod(e.target.value);
              setMsg(null);
              load(e.target.value);
            }}
            className="a-input !w-auto !py-1 text-[0.8125rem]"
          >
            {d.periods.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <Pill tone={status.tone}>{status.label}</Pill>
        <span className="text-xs" style={{ color: "var(--a-mute)" }}>
          {a.uitvoerder ?? "StiPP"}, aansluitnummer {a.aansluitnummer ?? <span style={{ color: "var(--a-crit)" }}>ontbreekt</span>}
        </span>
        <span className="ml-auto flex flex-wrap gap-1.5">
          <button
            type="button"
            disabled={busy !== null}
            onClick={async () => {
              setBusy("gen");
              setMsg(null);
              try {
                const r = await fetch("/api/admin/pensioen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ period }) });
                if (!r.ok) throw new Error("mislukt");
                setMsg("Aangifte opnieuw opgebouwd uit de loonstroken.");
                load(period ?? undefined);
              } finally {
                setBusy(null);
              }
            }}
            className="a-button text-xs"
          >
            {busy === "gen" ? "Bezig…" : "Opnieuw opbouwen"}
          </button>
          <a href={`/api/admin/pensioen/${period}/export`} className="a-button text-xs">Download CSV</a>
          <button
            type="button"
            disabled={busy !== null || a.lines.length === 0}
            onClick={async () => {
              if (!window.confirm(`Aangifte ${a.label} leveren aan StiPP?`)) return;
              setBusy("deliver");
              setMsg(null);
              try {
                const r = await fetch(`/api/admin/pensioen/${period}/deliver`, { method: "POST" });
                const res = await r.json();
                setMsg(res.detail ?? (r.ok ? "Geleverd." : "Niet geleverd."));
                load(period ?? undefined);
              } finally {
                setBusy(null);
              }
            }}
            className="a-button a-button-primary text-xs"
          >
            {busy === "deliver" ? "Leveren…" : "Leveren aan StiPP"}
          </button>
        </span>
      </section>

      {!d.deliveryConfigured && (
        <Notice>
          Nog geen automatisch leverkanaal. Zet STIPP_AANSLUITNUMMER, STIPP_UPA_ENDPOINT en STIPP_UPA_TOKEN in de omgeving, of download de CSV en lever die in het StiPP/APG-portaal. Zodra het kanaal er is, gaat de levering vanzelf op de 1e van de maand.
        </Notice>
      )}
      {msg && <Notice tone="ok">{msg}</Notice>}
      {a.leveringDetail && <Notice>Laatste levering: {a.leveringDetail}</Notice>}
      {a.totals.incompleet > 0 && (
        <Notice tone="crit" role="alert">{a.totals.incompleet} werknemer(s) hebben nog ontbrekende gegevens, vaak de BSN. Die regels kunnen niet geleverd worden tot ze compleet zijn.</Notice>
      )}

      <KpiStrip
        items={[
          { label: "Werknemers", value: count(a.totals.werknemers), hint: `${a.totals.uren.toLocaleString("nl-NL")} uur` },
          { label: "Pensioengevend loon", value: euroExact(a.totals.pensioengevendLoonCents), hint: a.label },
          { label: "Premie werkgever", value: euroExact(a.totals.werkgeverPremieCents), hint: "voor rekening van ZekerFlex" },
          { label: "Premie totaal", value: euroExact(a.totals.totaalPremieCents), hint: "af te dragen", tone: "money" },
        ]}
      />

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Panel title="Verdeling van de premie">
          <StackBar
            format={euroExact}
            emptyText="Geen premie in dit tijdvak."
            segments={[
              { label: "Werkgever", value: a.totals.werkgeverPremieCents, slot: 1 },
              { label: "Werknemer", value: a.totals.werknemerPremieCents, slot: 3 },
            ]}
          />
        </Panel>
        <Panel title="Klaar om te leveren" subtitle="Werknemers met alle gegevens compleet">
          <Meter
            label="Compleet"
            value={a.totals.werknemers - a.totals.incompleet}
            max={a.totals.werknemers}
            display={`${count(a.totals.werknemers - a.totals.incompleet)} van ${count(a.totals.werknemers)}, ${percentOf(a.totals.werknemers - a.totals.incompleet, a.totals.werknemers)}%`}
            tone={a.totals.incompleet > 0 ? "warn" : "ok"}
          />
        </Panel>
      </div>

      <Panel flush title="Regels van de aangifte" subtitle={a.label}>
        <DataTable
          columns={[
            { key: "name", label: "Naam" },
            { key: "bsn", label: "BSN", sortable: false },
            { key: "regeling", label: "Regeling", hideOnMobile: true },
            { key: "fase", label: "Fase", hideOnMobile: true },
            { key: "uren", label: "Uren", align: "right", hideOnMobile: true },
            { key: "loon", label: "Pens. loon", align: "right" },
            { key: "wn", label: "Premie wn.", align: "right", hideOnMobile: true },
            { key: "wg", label: "Premie wg.", align: "right", hideOnMobile: true },
            { key: "status", label: "Status" },
          ]}
          rows={rows}
          pageSize={20}
          searchPlaceholder="Zoek een naam"
          filters={[{ key: "complete", label: "Status", chips: true, options: [{ value: "no", label: "Onvolledig" }, { value: "yes", label: "Compleet" }] }]}
          emptyText="Geen uitzendkrachten met pensioenopbouw in dit tijdvak."
        />
      </Panel>
    </div>
  );
}
