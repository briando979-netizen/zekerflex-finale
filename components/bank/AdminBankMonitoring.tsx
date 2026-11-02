"use client";

import { useCallback, useEffect, useState } from "react";
import { dateTimeNl, euro } from "@/lib/admin/format";
import { Empty, Panel, Pill } from "@/components/admin/kit";
import { InlineAsk } from "@/components/admin/kit-client";

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

const postJson = (url: string, body: unknown) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

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
    <Panel
      flush
      title="Transactiemonitoring"
      subtitle={open.length ? `${open.length} open` : "Alles is beoordeeld"}
      actions={
        <label className="flex items-center gap-1.5 text-xs" style={{ color: "var(--a-mute)" }}>
          <input type="checkbox" checked={showReviewed} onChange={(e) => setShowReviewed(e.target.checked)} /> Ook beoordeelde
        </label>
      }
    >
      {shown.length === 0 ? (
        <Empty title="Geen signalen" body="Geen open signalen in de afgelopen 7 dagen." />
      ) : (
        <ul>
          {shown.map((a) => (
            <li key={a.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 text-[0.8125rem] sm:px-5 ${a.reviewed ? "opacity-60" : ""}`} style={{ borderTop: "1px solid var(--a-border)" }}>
              <span className="min-w-[14rem] flex-1">
                <span className="block font-medium" style={{ color: "var(--a-text)" }}>{a.title}, {a.holderName}</span>
                <span className="block text-xs" style={{ color: "var(--a-mute)" }}>{a.detail}, {dateTimeNl(a.at)}</span>
                {a.reviewed && <span className="mt-1 block text-xs" style={{ color: "var(--a-ok)" }}>{a.reviewed.by}: {a.reviewed.note}</span>}
              </span>
              <span className="num font-semibold" style={{ color: "var(--a-text)" }}>{euro(a.amountCents)}</span>
              {a.reviewed ? (
                <Pill tone="ok">Beoordeeld</Pill>
              ) : (
                <span className="inline-flex flex-wrap items-center gap-1.5">
                  <InlineAsk
                    label="Beoordeeld"
                    question="Beoordeling, bijvoorbeeld: loon van werkgever, in orde"
                    required
                    submitLabel="Vastleggen"
                    onSubmit={async (note) => {
                      await postJson("/api/admin/bank/monitoring", { id: a.id, note });
                      await load();
                    }}
                  />
                  <InlineAsk
                    label="Blokkeren"
                    question={`Rekening van ${a.holderName} blokkeren: reden?`}
                    initial={a.title}
                    required
                    submitLabel="Blokkeren"
                    onSubmit={async (reason) => {
                      await postJson(`/api/admin/bank/accounts/${a.accountId}`, { action: "freeze", reason });
                      await postJson("/api/admin/bank/monitoring", { id: a.id, note: `Rekening geblokkeerd: ${reason}` });
                      await load();
                    }}
                  />
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
