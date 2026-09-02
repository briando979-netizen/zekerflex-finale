"use client";

import { useCallback, useEffect, useState } from "react";
import { euro } from "@/lib/payroll/format";
import type { PayrollRun, RunSummary } from "@/lib/payroll/store";
import { useToast } from "@/components/ui/Toast";

interface Index {
  runs: RunSummary[];
  suggestedWeek: { id: string; label: string };
}

const KIND: Record<string, string> = { zzp: "Zzp", flexwerker: "Flex", uitzendkracht: "Uitzend" };

export function PayrollBoard() {
  const toast = useToast();
  const [index, setIndex] = useState<Index | null>(null);
  const [week, setWeek] = useState("");
  const [run, setRun] = useState<PayrollRun | null>(null);
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
        toast.success(
          action === "finalise"
            ? "Verloningsronde definitief gemaakt"
            : data.rebuilt
              ? "Concept opnieuw berekend"
              : `Concept aangemaakt — ${data.run.totals.workers} werkers`,
        );
        await loadIndex();
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [week, toast, loadIndex],
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Wekelijkse verloning</h1>
        <p className="mt-1 text-sm text-neutralx-600">
          Bundelt alle goedgekeurde uren per kalenderweek tot loonstroken (uitzendkracht) en
          wekelijkse facturen (zzp/flex). Leest de database alleen — concepten en definitieve
          rondes staan in <code className="font-mono text-xs">storage/payroll</code>.
        </p>
      </div>

      <div className="card flex flex-wrap items-end gap-3 p-4">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutralx-500">ISO-week</span>
          <input
            value={week}
            onChange={(e) => setWeek(e.target.value.trim())}
            placeholder="2026-W35"
            className="w-36 rounded-lg border border-hairstrong px-3 py-2 font-mono text-sm outline-none focus:border-brand-500"
          />
        </label>
        {index && (
          <button
            type="button"
            onClick={() => setWeek(index.suggestedWeek.id)}
            className="text-xs text-brand-600 underline"
          >
            vorige volledige week ({index.suggestedWeek.label.split("·")[0]?.trim()})
          </button>
        )}
        <div className="flex-1" />
        <button type="button" disabled={busy || !week} onClick={() => act("build")} className="btn-primary">
          {busy ? "Bezig…" : "Bereken concept"}
        </button>
        <button
          type="button"
          disabled={busy || !run || run.status === "finalised"}
          onClick={() => act("finalise")}
          className="btn-ghost"
        >
          Definitief maken
        </button>
      </div>

      {run && (
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hair px-5 py-3">
            <div>
              <p className="font-semibold text-ink">{run.weekLabel}</p>
              <p className="text-xs text-neutralx-500">
                {run.status === "finalised" ? "Definitief" : "Concept"} ·{" "}
                {run.totals.workers} werkers · {run.totals.payrollWorkers} loonstrook ·{" "}
                {run.totals.invoiceWorkers} factuur
              </p>
            </div>
            <div className="text-right">
              <p className="num font-display text-xl font-bold text-brand-600">{euro(run.totals.payoutCents)}</p>
              <p className="text-xs text-neutralx-400">totale uitbetaling</p>
            </div>
          </div>

          {run.totals.fiscalIncomplete > 0 && (
            <p className="border-b border-hair bg-warn/5 px-5 py-2 text-xs text-warn">
              {run.totals.fiscalIncomplete} werker(s) met onvolledige fiscale gegevens — verloning is indicatief tot ze compleet zijn.
            </p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-hair text-left text-xs uppercase tracking-wide text-neutralx-500">
                  <th className="px-5 py-2.5 font-medium">Werker</th>
                  <th className="px-5 py-2.5 font-medium">Vorm</th>
                  <th className="px-5 py-2.5 text-right font-medium">Uren</th>
                  <th className="px-5 py-2.5 text-right font-medium">Bruto / dienst</th>
                  <th className="px-5 py-2.5 text-right font-medium">Uitbetaling</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hair">
                {run.payslips.map((p) => {
                  const b = p.computed.breakdown;
                  const gross = b.kind === "payroll" ? b.grossCents : b.servicesCents;
                  return (
                    <tr key={p.userId}>
                      <td className="px-5 py-3">
                        <p className="font-medium text-ink">{p.workerName}</p>
                        <p className="text-xs text-neutralx-400">
                          {b.kind === "payroll" ? `fase ${b.phase} · ${p.weeksWorked} wk` : b.mode}
                          {!p.fiscalComplete && " · ⚠ onvolledig"}
                        </p>
                      </td>
                      <td className="px-5 py-3 text-neutralx-600">{KIND[p.workerKind ?? ""] ?? "—"}</td>
                      <td className="num px-5 py-3 text-right text-neutralx-600">
                        {p.computed.totalHours.toLocaleString("nl-NL")}
                      </td>
                      <td className="num px-5 py-3 text-right text-neutralx-600">{euro(gross)}</td>
                      <td className="num px-5 py-3 text-right font-medium text-ink">
                        {euro(p.computed.headlineCents)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        <p className="border-b border-hair px-5 py-2.5 text-xs font-medium uppercase tracking-wide text-neutralx-500">
          Eerdere rondes
        </p>
        {!index ? (
          <div className="space-y-px">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-11 animate-pulse bg-paper-soft" />)}</div>
        ) : index.runs.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-neutralx-400">Nog geen verloningsrondes.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody className="divide-y divide-hair">
              {index.runs.map((r) => (
                <tr key={r.id} className="cursor-pointer hover:bg-paper-soft" onClick={() => void openRun(r.id)}>
                  <td className="px-5 py-3 font-mono text-xs text-neutralx-600">{r.id}</td>
                  <td className="px-5 py-3 text-neutralx-600">{r.weekLabel.split("·")[1]?.trim() ?? r.weekLabel}</td>
                  <td className="px-5 py-3">
                    <span className={r.status === "finalised" ? "pill-ok" : "pill-warn"}>
                      {r.status === "finalised" ? "Definitief" : "Concept"}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right text-neutralx-600">{r.workers} werkers</td>
                  <td className="num px-5 py-3 text-right font-medium text-ink">{euro(r.payoutCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
