"use client";

import { useCallback, useEffect, useState } from "react";

interface Client {
  tenantId: string;
  name: string;
  offerFastPay: boolean;
  advancesForUitzend: boolean;
  credit: { status: "none" | "approved" | "review" | "rejected"; score: number; reasons: string[]; checkedAt: string; decidedBy?: string };
}

const CLS: Record<Client["credit"]["status"], string> = {
  review: "bg-warn/10 text-warn",
  rejected: "bg-crit/10 text-crit",
  approved: "bg-ok/10 text-ok",
  none: "bg-paper-soft text-neutralx-500",
};
const LABEL: Record<Client["credit"]["status"], string> = { review: "te beoordelen", rejected: "afgewezen", approved: "goedgekeurd", none: "geen check" };

/** /admin/bank: credit decisions for clients that want to offer fast payout. */
export function AdminFastPay() {
  const [clients, setClients] = useState<Client[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/fastpay", { cache: "no-store" }).catch(() => null);
    if (r?.ok) setClients((await r.json()).clients);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function post(body: unknown) {
    await fetch("/api/admin/fastpay", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    await load();
  }

  if (!clients) return null;
  const toReview = clients.filter((c) => c.credit.status === "review").length;

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-hair px-5 py-3">
        <span className="text-sm font-semibold">⚡ Snelle uitbetaling — kredietbeoordeling</span>
        {toReview > 0 && <span className="rounded-full bg-warn/10 px-2 py-0.5 text-[11px] font-semibold text-warn">{toReview} te beoordelen</span>}
      </div>
      {clients.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-neutralx-400">Nog geen opdrachtgevers die snelle uitbetaling willen aanbieden.</p>
      ) : (
        <ul className="divide-y divide-hair text-sm">
          {clients.map((c) => (
            <li key={c.tenantId} className="px-5 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" onClick={() => setOpen(open === c.tenantId ? null : c.tenantId)} className="min-w-0 flex-1 text-left">
                  <span className="block font-medium text-ink">{c.name}</span>
                  <span className="block text-xs text-neutralx-500">
                    score {c.credit.score}/100 · {c.offerFastPay ? "wil aanbieden" : "staat uit"} · voorschot uitzend {c.advancesForUitzend ? "aan" : "uit"}
                    {c.credit.decidedBy ? ` · besloten door ${c.credit.decidedBy}` : ""}
                  </span>
                </button>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${CLS[c.credit.status]}`}>{LABEL[c.credit.status]}</span>
                <button
                  type="button"
                  onClick={() => {
                    const note = window.prompt(`${c.name} goedkeuren voor snelle uitbetaling — onderbouwing?`);
                    if (note) void post({ action: "decide", tenantId: c.tenantId, status: "approved", note });
                  }}
                  className="text-xs font-semibold text-ok hover:underline"
                >
                  Goedkeuren
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const note = window.prompt(`${c.name} afwijzen — reden?`);
                    if (note) void post({ action: "decide", tenantId: c.tenantId, status: "rejected", note });
                  }}
                  className="text-xs text-neutralx-500 hover:text-crit hover:underline"
                >
                  Afwijzen
                </button>
                <button type="button" onClick={() => post({ action: "recheck", tenantId: c.tenantId })} className="text-xs text-brand-600 hover:underline">
                  Opnieuw checken
                </button>
              </div>
              {open === c.tenantId && (
                <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-neutralx-600">
                  {c.credit.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
