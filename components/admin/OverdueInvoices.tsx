"use client";

import { useCallback, useEffect, useState } from "react";

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

const euro = (c: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(c / 100);
const STAGE = ["nog geen herinnering", "1e herinnering verstuurd", "2e herinnering verstuurd", "bij jou gemeld"];

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
  const toggleRow = (
    <label className="flex items-center gap-2 text-xs font-semibold text-neutralx-600">
      <input type="checkbox" checked={enabled} onChange={(e) => void toggle(e.target.checked)} className="h-4 w-4 accent-brand-500" />
      Automatische herinneringen {enabled ? "aan" : "uit"}
    </label>
  );
  if (rows.length === 0)
    return (
      <section className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-hair bg-white px-5 py-3 shadow-card">
        <p className="min-w-0 flex-1 text-sm text-neutralx-600">Geen achterstallige facturen. 👍</p>
        {toggleRow}
      </section>
    );
  const groups = [...rows.reduce((m, r) => m.set(r.tenantId, [...(m.get(r.tenantId) ?? []), r]), new Map<string, Row[]>())];
  const total = rows.reduce((s, r) => s + r.totalCents, 0);

  async function remind(tenantId: string, name: string) {
    setBusy(tenantId);
    const r = await fetch("/api/admin/invoices/overdue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenantId }) }).catch(() => null);
    setBusy(null);
    const d = r ? await r.json().catch(() => ({})) : {};
    setNote(r?.ok ? `Herinnering verstuurd naar ${name}.` : (d.error?.message ?? "Versturen lukte niet."));
    void load();
  }

  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-warn/40 bg-white shadow-card">
      <div className="flex flex-wrap items-start gap-3 border-b border-hair px-5 py-4">
        <div className="min-w-[15rem] flex-1">
        <p className="text-sm font-semibold text-ink">
          ⏰ Achterstallig: {euro(total)} bij {groups.length} bedrij{groups.length === 1 ? "f" : "ven"}
        </p>
        <p className="text-xs text-neutralx-500">Betaaltermijn 14 dagen. {enabled ? "Automatisch" : "Als je het aanzet"}: herinnering na 3 dagen, tweede na 10, melding bij jou na 17. Freelancers met standaard uitbetaling wachten op deze betalingen.</p>
        </div>
        {toggleRow}
      </div>
      {note && <p className="border-b border-hair px-5 py-2.5 text-sm text-neutralx-600">{note}</p>}
      <ul className="divide-y divide-hair">
        {groups.map(([tenantId, list]) => {
          const sum = list.reduce((s, r) => s + r.totalCents, 0);
          const worst = Math.max(...list.map((r) => r.daysLate));
          const stage = Math.max(...list.map((r) => r.stage));
          return (
            <li key={tenantId} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
              <span className="min-w-[12rem] flex-1">
                <span className="block font-medium text-ink">{list[0]!.tenantName}</span>
                <span className="block text-xs text-neutralx-500">
                  {list.length} factu{list.length === 1 ? "ur" : "ren"} · tot {worst} dag{worst === 1 ? "" : "en"} te laat · {STAGE[stage] ?? STAGE[3]}
                </span>
              </span>
              <span className="num font-semibold text-ink">{euro(sum)}</span>
              <button type="button" disabled={busy === tenantId} onClick={() => void remind(tenantId, list[0]!.tenantName)} className="btn-ghost text-xs disabled:opacity-50">
                {busy === tenantId ? "Versturen…" : "Nu herinneren"}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
