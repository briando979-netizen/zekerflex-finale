"use client";

import { useCallback, useEffect, useState } from "react";
import { Empty, Panel, Pill, type Tone } from "@/components/admin/kit";
import { InlineAsk } from "@/components/admin/kit-client";

interface Client {
  tenantId: string;
  name: string;
  offerFastPay: boolean;
  advancesForUitzend: boolean;
  credit: { status: "none" | "approved" | "review" | "rejected"; score: number; reasons: string[]; checkedAt: string; decidedBy?: string };
}

const STATUS: Record<Client["credit"]["status"], { label: string; tone: Tone }> = {
  review: { label: "Te beoordelen", tone: "warn" },
  rejected: { label: "Afgewezen", tone: "crit" },
  approved: { label: "Goedgekeurd", tone: "ok" },
  none: { label: "Geen check", tone: "neutral" },
};

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
    <Panel flush title="Snelle uitbetaling" subtitle={toReview > 0 ? `Kredietbeoordeling: ${toReview} te beoordelen` : "Kredietbeoordeling van opdrachtgevers"}>
      {clients.length === 0 ? (
        <Empty title="Nog geen aanvragen" body="Nog geen opdrachtgevers die snelle uitbetaling willen aanbieden." />
      ) : (
        <ul>
          {clients.map((c) => {
            const status = STATUS[c.credit.status];
            return (
              <li key={c.tenantId} className="px-4 py-3 text-[0.8125rem] sm:px-5" style={{ borderTop: "1px solid var(--a-border)" }}>
                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" onClick={() => setOpen(open === c.tenantId ? null : c.tenantId)} aria-expanded={open === c.tenantId} className="min-w-[14rem] flex-1 text-left">
                    <span className="block font-medium" style={{ color: "var(--a-text)" }}>{c.name}</span>
                    <span className="block text-xs" style={{ color: "var(--a-mute)" }}>
                      Score {c.credit.score}/100, {c.offerFastPay ? "wil aanbieden" : "staat uit"}, voorschot uitzend {c.advancesForUitzend ? "aan" : "uit"}
                      {c.credit.decidedBy ? `, besloten door ${c.credit.decidedBy}` : ""}
                    </span>
                  </button>
                  <Pill tone={status.tone}>{status.label}</Pill>
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    <InlineAsk label="Goedkeuren" question={`${c.name} goedkeuren voor snelle uitbetaling: onderbouwing?`} placeholder="Onderbouwing" required submitLabel="Goedkeuren" onSubmit={(note) => post({ action: "decide", tenantId: c.tenantId, status: "approved", note })} />
                    <InlineAsk label="Afwijzen" question={`${c.name} afwijzen: reden?`} placeholder="Reden" required submitLabel="Afwijzen" onSubmit={(note) => post({ action: "decide", tenantId: c.tenantId, status: "rejected", note })} />
                    <button type="button" onClick={() => void post({ action: "recheck", tenantId: c.tenantId })} className="a-button text-xs">Opnieuw checken</button>
                  </span>
                </div>
                {open === c.tenantId && (
                  <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs" style={{ color: "var(--a-dim)" }}>
                    {c.credit.reasons.map((r) => <li key={r}>{r}</li>)}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
