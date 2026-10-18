"use client";

import { useCallback, useEffect, useState } from "react";

interface Alert {
  id: string;
  accountId: string;
  holderName: string;
  rule: string;
  title: string;
  detail: string;
  amountCents: number;
  at: string;
  reviewed?: { by: string; note: string; at: string };
}

const euro = (c: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(c / 100);
const ICON: Record<string, string> = { large: "💰", passthrough: "🔀", fan_in: "🕸️", burst: "⚡", new_account_volume: "🆕" };

/** Transaction-monitoring signals with review + freeze, on /admin/bank. */
export function AdminBankMonitoring() {
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [showReviewed, setShowReviewed] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/bank/monitoring", { cache: "no-store" }).catch(() => null);
    if (r?.ok) setAlerts((await r.json()).alerts);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  if (!alerts) return null;
  const open = alerts.filter((a) => !a.reviewed);
  const shown = showReviewed ? alerts : open;

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-hair px-5 py-3">
        <span className="text-sm font-semibold">🛡️ Transactiemonitoring</span>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${open.length ? "bg-crit/10 text-crit" : "bg-ok/10 text-ok"}`}>{open.length ? `${open.length} open` : "alles beoordeeld"}</span>
        <label className="ml-auto flex items-center gap-1.5 text-xs text-neutralx-500">
          <input type="checkbox" checked={showReviewed} onChange={(e) => setShowReviewed(e.target.checked)} /> ook beoordeelde
        </label>
      </div>
      {shown.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-neutralx-400">Geen signalen in de afgelopen 7 dagen.</p>
      ) : (
        <ul className="divide-y divide-hair text-sm">
          {shown.map((a) => (
            <li key={a.id} className={`flex flex-wrap items-center gap-3 px-5 py-3 ${a.reviewed ? "opacity-60" : ""}`}>
              <span className="text-xl">{ICON[a.rule] ?? "⚠️"}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-ink">
                  {a.title} — {a.holderName}
                </span>
                <span className="block text-xs text-neutralx-500">
                  {a.detail} · {new Date(a.at).toLocaleString("nl-NL")}
                </span>
                {a.reviewed && (
                  <span className="block text-xs text-ok">
                    ✓ {a.reviewed.by}: {a.reviewed.note}
                  </span>
                )}
              </span>
              <span className="num font-semibold">{euro(a.amountCents)}</span>
              {!a.reviewed && (
                <>
                  <button
                    type="button"
                    onClick={async () => {
                      const note = window.prompt("Beoordeling (bv. 'loon van werkgever, in orde')");
                      if (!note) return;
                      await fetch("/api/admin/bank/monitoring", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: a.id, note }) });
                      await load();
                    }}
                    className="text-xs font-semibold text-ok hover:underline"
                  >
                    Beoordeeld
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const reason = window.prompt(`Rekening van ${a.holderName} blokkeren — reden?`, a.title);
                      if (!reason) return;
                      await fetch(`/api/admin/bank/accounts/${a.accountId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "freeze", reason }) });
                      await fetch("/api/admin/bank/monitoring", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: a.id, note: `Rekening geblokkeerd: ${reason}` }) });
                      await load();
                    }}
                    className="text-xs font-semibold text-crit hover:underline"
                  >
                    Blokkeren
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
