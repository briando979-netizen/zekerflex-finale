"use client";

import { useCallback, useEffect, useState } from "react";
import { count, euro, euroExact } from "@/lib/admin/format";
import type { PayrollRun, RunSummary } from "@/lib/payroll/store";
import { useToast } from "@/components/ui/Toast";
import { Empty, KpiStrip, Notice, PageHead, Panel, Pill, StackBar } from "@/components/admin/kit";
import { Chart, DataTable, type TableRow } from "@/components/admin/kit-client";

interface Index {
  runs: RunSummary[];
  suggestedWeek: { id: string; label: string };
}

interface SepaBatchResult {
  generated: boolean;
  totalCents: number;
  lineCount: number;
  skipped: { userId: string; workerName: string; reason: string }[];
  blockedReason?: string;
}

const KIND: Record<string, string> = { zzp: "Zzp", flexwerker: "Flex", uitzendkracht: "Uitzend" };

export function PayrollBoard() {
  const toast = useToast();
  const [index, setIndex] = useState<Index | null>(null);
  const [week, setWeek] = useState("");
  const [run, setRun] = useState<PayrollRun | null>(null);
  const [sepaBatch, setSepaBatch] = useState<SepaBatchResult | null>(null);
  const [busy, setBusy] = useState(false);

  const loadIndex = useCallback(async () => {
    const r = await fetch("/api/admin/payroll", { cache: "no-store" });
    if (!r.ok) return;
    const data = (await r.json()) as Index;
    setIndex(data);
    setWeek((w) => w || data.suggestedWeek.id);
  }, []);

  useEffect(() => {
    void loadIndex();
  }, [loadIndex]);

  const openRun = useCallback(async (isoWeek: string) => {
    setSepaBatch(null);
    const r = await fetch(`/api/admin/payroll/${isoWeek}`, { cache: "no-store" });
    if (r.ok) setRun((await r.json()).run as PayrollRun);
  }, []);

  const act = useCallback(
    async (action: "build" | "finalise") => {
      if (!week) return;
      setBusy(true);
      try {
        const r = await fetch("/api/admin/payroll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isoWeek: week, action }),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error?.message ?? "Mislukt");
        setRun(data.run as PayrollRun);
        setSepaBatch(action === "finalise" ? (data.sepaBatch as SepaBatchResult | null) : null);
        if (action === "finalise" && data.sepaBatch?.generated) {
          toast.success(`Definitief gemaakt, SEPA-batch klaar (${data.sepaBatch.lineCount} regels)`);
        } else if (action === "finalise") {
          toast.success(data.sepaBatch?.blockedReason ? "Definitief gemaakt, geen betaalbestand: zie toelichting" : "Verloningsronde definitief gemaakt");
        } else {
          toast.success(data.rebuilt ? "Concept opnieuw berekend" : `Concept aangemaakt, ${data.run.totals.workers} werkers`);
        }
        await loadIndex();
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [week, toast, loadIndex],
  );

  const runs = index?.runs ?? [];
  const history = [...runs].reverse();
  const latest = runs[0] ?? null;
  const finalised = runs.filter((r) => r.status === "finalised");

  const payslipRows: TableRow[] = (run?.payslips ?? []).map((p) => {
    const b = p.computed.breakdown;
    const gross = b.kind === "payroll" ? b.grossCents : b.servicesCents;
    return {
      id: p.userId,
      search: p.workerName,
      filters: { kind: p.workerKind ?? "", complete: p.fiscalComplete ? "yes" : "no" },
      cells: {
        name: (
          <span>
            <span className="block font-medium" style={{ color: "var(--a-text)" }}>{p.workerName}</span>
            <span className="block text-xs" style={{ color: "var(--a-mute)" }}>{b.kind === "payroll" ? `Fase ${b.phase}, ${p.weeksWorked} weken` : b.mode}</span>
          </span>
        ),
        kind: KIND[p.workerKind ?? ""] ?? "—",
        hours: p.computed.totalHours.toLocaleString("nl-NL"),
        gross: euroExact(gross),
        payout: <span className="font-medium" style={{ color: "var(--a-text)" }}>{euroExact(p.computed.headlineCents)}</span>,
        fiscal: p.fiscalComplete ? <Pill tone="ok">Compleet</Pill> : <Pill tone="warn">Onvolledig</Pill>,
      },
      sort: { name: p.workerName, kind: p.workerKind ?? "", hours: p.computed.totalHours, gross, payout: p.computed.headlineCents, fiscal: p.fiscalComplete ? 1 : 0 },
      csv: { name: p.workerName, kind: KIND[p.workerKind ?? ""] ?? "", hours: p.computed.totalHours, gross: (gross / 100).toFixed(2), payout: (p.computed.headlineCents / 100).toFixed(2), fiscal: p.fiscalComplete ? "Compleet" : "Onvolledig" },
    };
  });

  const runRows: TableRow[] = runs.map((r) => ({
    id: r.id,
    search: `${r.id} ${r.weekLabel}`,
    cells: {
      id: (
        <button type="button" onClick={() => void openRun(r.id)} className="font-mono text-xs font-medium hover:underline" style={{ color: "var(--a-accent-ink)" }}>{r.id}</button>
      ),
      label: r.weekLabel.split("·")[1]?.trim() ?? r.weekLabel,
      status: <Pill tone={r.status === "finalised" ? "ok" : "warn"}>{r.status === "finalised" ? "Definitief" : "Concept"}</Pill>,
      workers: count(r.workers),
      payout: <span className="font-medium" style={{ color: "var(--a-text)" }}>{euroExact(r.payoutCents)}</span>,
    },
    sort: { id: r.id, status: r.status, workers: r.workers, payout: r.payoutCents },
  }));

  return (
    <div className="space-y-4">
      <PageHead
        title="Wekelijkse verloning"
        subtitle="Bundelt alle goedgekeurde uren per kalenderweek tot loonstroken (uitzendkracht) en wekelijkse facturen (zzp en flex)."
      />

      <KpiStrip
        items={[
          { label: "Laatste ronde", value: latest?.id ?? "—", hint: latest ? (latest.status === "finalised" ? "Definitief" : "Nog een concept") : "nog geen rondes", ...(latest && latest.status !== "finalised" ? { tone: "warn" as const } : {}) },
          { label: "Uitbetaling", value: latest ? euro(latest.payoutCents) : "—", hint: "in de laatste ronde", spark: history.map((r) => r.payoutCents), tone: "money" },
          { label: "Werkers", value: latest ? count(latest.workers) : "—", hint: "in de laatste ronde" },
          { label: "Definitieve rondes", value: count(finalised.length), hint: `van de ${count(runs.length)} rondes` },
          { label: "Onvolledig fiscaal", value: latest ? count(latest.fiscalIncomplete) : "—", hint: "in de laatste ronde", ...(latest && latest.fiscalIncomplete > 0 ? { tone: "warn" as const } : {}) },
        ]}
      />

      <div className="grid items-start gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Panel title="Uitbetaling per week" subtitle={runs.length > 0 ? `De laatste ${runs.length} rondes` : undefined}>
          <Chart title="Totale uitbetaling per verloningsronde" kind="bars" unit="money" labels={history.map((r) => r.id)} series={[{ label: "Uitbetaling", values: history.map((r) => r.payoutCents) }]} height={190} emptyText="Nog geen verloningsrondes." />
        </Panel>
        <Panel title="Ronde maken" subtitle="Bereken eerst een concept. Definitief maken zet de loonstroken en facturen vast.">
          <div className="space-y-3">
            <label className="a-label">
              Week
              <input value={week} onChange={(e) => setWeek(e.target.value.trim())} placeholder="2026-W35" className="a-input font-mono" />
            </label>
            {index && (
              <button type="button" onClick={() => setWeek(index.suggestedWeek.id)} className="block text-xs font-medium hover:underline" style={{ color: "var(--a-accent-ink)" }}>
                Vorige volledige week ({index.suggestedWeek.label.split("·")[0]?.trim()})
              </button>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy || !week} onClick={() => void act("build")} className="a-button a-button-primary">{busy ? "Bezig…" : "Bereken concept"}</button>
              <button type="button" disabled={busy || !run || run.status === "finalised"} onClick={() => void act("finalise")} className="a-button">Definitief maken</button>
            </div>
          </div>
        </Panel>
      </div>

      {run && (
        <>
          {run.status === "finalised" &&
            (sepaBatch?.blockedReason ? (
              <Notice tone="crit" role="alert">Geen betaalbestand gemaakt: {sepaBatch.blockedReason}</Notice>
            ) : (
              <Panel>
                <div className="flex flex-wrap items-center justify-between gap-3 text-[0.8125rem]" style={{ color: "var(--a-dim)" }}>
                  <p>
                    {sepaBatch?.generated
                      ? `SEPA-batch klaar: ${sepaBatch.lineCount} regels, ${euroExact(sepaBatch.totalCents)}. ZekerFlex voert niets zelf uit: download en verwerk in je eigen bankomgeving.`
                      : "Betaalbestand (SEPA-batch) voor deze week, indien aanwezig."}
                  </p>
                  <a href={`/api/admin/payroll/${run.isoWeek}/sepa-batch`} className="a-button text-xs">Download betaalbestand (.xml)</a>
                </div>
              </Panel>
            ))}
          {sepaBatch && sepaBatch.skipped.length > 0 && (
            <Notice tone="warn">
              Niet in de batch opgenomen: {sepaBatch.skipped.map((s) => `${s.workerName} (${s.reason})`).join(", ")}.
            </Notice>
          )}
          {run.totals.fiscalIncomplete > 0 && (
            <Notice tone="warn">{run.totals.fiscalIncomplete} werker(s) met onvolledige fiscale gegevens. De verloning is indicatief tot ze compleet zijn.</Notice>
          )}

          <Panel
            flush
            title={run.weekLabel}
            subtitle={`${run.status === "finalised" ? "Definitief" : "Concept"}: ${run.totals.workers} werkers, ${run.totals.payrollWorkers} loonstrook, ${run.totals.invoiceWorkers} factuur`}
            actions={
              <div className="text-right">
                <p className="text-lg font-semibold tracking-tight" style={{ color: "var(--a-money)" }}>{euroExact(run.totals.payoutCents)}</p>
                <p className="text-xs" style={{ color: "var(--a-mute)" }}>totale uitbetaling</p>
              </div>
            }
          >
            <div className="px-4 pb-3 sm:px-5">
              <StackBar
                segments={[
                  { label: "Loonstrook", value: run.totals.payrollWorkers, slot: 1 },
                  { label: "Factuur", value: run.totals.invoiceWorkers, slot: 3 },
                ]}
                format={(v) => `${v} ${v === 1 ? "werker" : "werkers"}`}
                emptyText="Geen werkers in deze ronde."
              />
            </div>
            <DataTable
              columns={[
                { key: "name", label: "Werker" },
                { key: "kind", label: "Vorm", hideOnMobile: true },
                { key: "hours", label: "Uren", align: "right" },
                { key: "gross", label: "Bruto of dienst", align: "right", hideOnMobile: true },
                { key: "payout", label: "Uitbetaling", align: "right" },
                { key: "fiscal", label: "Fiscaal", hideOnMobile: true },
              ]}
              rows={payslipRows}
              pageSize={15}
              searchPlaceholder="Zoek een werker"
              csvName={`verloning-${run.isoWeek}`}
              filters={[{ key: "kind", label: "Vorm", chips: true, options: Object.entries(KIND).map(([value, label]) => ({ value, label })) }]}
              defaultSort={{ key: "payout", dir: "desc" }}
              emptyText="Geen goedgekeurde uren in deze week."
            />
          </Panel>
        </>
      )}

      <Panel flush title="Eerdere rondes" subtitle="Klik een week open om de loonstroken te zien">
        {!index ? (
          <div className="mx-5 mb-5 h-24 animate-pulse rounded-lg" style={{ background: "var(--a-elev)" }} />
        ) : runs.length === 0 ? (
          <Empty title="Nog geen verloningsrondes" body="Bereken hierboven het eerste concept." />
        ) : (
          <DataTable
            columns={[
              { key: "id", label: "Week" },
              { key: "label", label: "Periode", hideOnMobile: true, sortable: false },
              { key: "status", label: "Status" },
              { key: "workers", label: "Werkers", align: "right", hideOnMobile: true },
              { key: "payout", label: "Uitbetaling", align: "right" },
            ]}
            rows={runRows}
            pageSize={10}
            defaultSort={{ key: "id", dir: "desc" }}
          />
        )}
      </Panel>
    </div>
  );
}
