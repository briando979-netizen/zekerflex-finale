"use client";

import { useCallback, useEffect, useState } from "react";
import { euroExact } from "@/lib/admin/format";
import { Panel, Pill } from "@/components/admin/kit";

interface Row {
  id: string;
  number: string;
  totalCents: number;
  dueAt: string;
  daysLate: number;
  stage: number;
  tenantId: string;
  tenantName: string;
}

const STAGE = ["Nog geen herinnering", "1e herinnering verstuurd", "2e herinnering verstuurd", "Bij jou gemeld"];

/** Overdue client invoices grouped per company, with the reminder progress and a "remind now" button. */
export function OverdueInvoices() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/invoices/overdue", { cache: "no-store" }).catch(() => null);
    if (r?.ok) {
      const d = await r.json();
      setRows(d.invoices);
      setEnabled(Boolean(d.settings?.enabled));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  if (rows === null) return null;

  async function toggle(next: boolean) {
    if (next && !window.confirm("Automatische betaalherinneringen aanzetten? Vanaf morgen 09:00 krijgen bedrijven met verlopen facturen automatisch een herinnering per mail (stap voor stap: 1e herinnering, 2e herinnering, daarna een melding bij jou).")) return;
    const r = await fetch("/api/admin/invoices/overdue", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: next }) }).catch(() => null);
    if (r?.ok) setEnabled(next);
  }
  async function remind(tenantId: string, name: string) {
    setBusy(tenantId);
    const r = await fetch("/api/admin/invoices/overdue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenantId }) }).catch(() => null);
    setBusy(null);
    const d = r ? await r.json().catch(() => ({})) : {};
    setNote(r?.ok ? `Herinnering verstuurd naar ${name}.` : (d.error?.message ?? "Versturen lukte niet."));
    void load();
  }

  const toggleRow = (
    <label className="flex items-center gap-2 text-xs font-medium" style={{ color: "var(--a-dim)" }}>
      <input type="checkbox" checked={enabled} onChange={(e) => void toggle(e.target.checked)} className="h-4 w-4" />
      Automatische herinneringen {enabled ? "aan" : "uit"}
    </label>
  );

  const groups = [...rows.reduce((m, r) => m.set(r.tenantId, [...(m.get(r.tenantId) ?? []), r]), new Map<string, Row[]>())];
  const total = rows.reduce((s, r) => s + r.totalCents, 0);

  return (
    <Panel
      flush
      title={rows.length === 0 ? "Betaalherinneringen" : `Achterstallig: ${euroExact(total)} bij ${groups.length} ${groups.length === 1 ? "bedrijf" : "bedrijven"}`}
      subtitle={rows.length === 0 ? "Geen achterstallige facturen." : `Betaaltermijn 14 dagen. ${enabled ? "Automatisch" : "Als je het aanzet"}: herinnering na 3 dagen, tweede na 10, melding bij jou na 17.`}
      actions={toggleRow}
    >
      {note && <p className="px-5 pb-3 text-sm" style={{ color: "var(--a-dim)" }}>{note}</p>}
      {groups.length > 0 && (
        <ul>
          {groups.map(([tenantId, list]) => {
            const sum = list.reduce((s, r) => s + r.totalCents, 0);
            const worst = Math.max(...list.map((r) => r.daysLate));
            const stage = Math.max(...list.map((r) => r.stage));
            return (
              <li key={tenantId} className="flex flex-wrap items-center gap-3 px-4 py-3 text-[0.8125rem] sm:px-5" style={{ borderTop: "1px solid var(--a-border)" }}>
                <span className="min-w-[12rem] flex-1">
                  <span className="block font-medium" style={{ color: "var(--a-text)" }}>{list[0]!.tenantName}</span>
                  <span className="block text-xs" style={{ color: "var(--a-mute)" }}>
                    {list.length} {list.length === 1 ? "factuur" : "facturen"}, tot {worst} {worst === 1 ? "dag" : "dagen"} te laat
                  </span>
                </span>
                <Pill tone={stage >= 3 ? "crit" : stage > 0 ? "warn" : "neutral"}>{STAGE[stage] ?? STAGE[3]}</Pill>
                <span className="num w-24 text-right font-semibold" style={{ color: "var(--a-text)" }}>{euroExact(sum)}</span>
                <button type="button" disabled={busy === tenantId} onClick={() => void remind(tenantId, list[0]!.tenantName)} className="a-button text-xs">
                  {busy === tenantId ? "Versturen…" : "Nu herinneren"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
