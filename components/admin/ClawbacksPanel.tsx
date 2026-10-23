"use client";

import { useCallback, useEffect, useState } from "react";

interface Clawback {
  invoiceId: string;
  invoiceNumber: string;
  tenantId: string | null;
  amountCents: number;
  reason: string;
  workerPaid: boolean;
  status: string;
  at: string;
}

const eur = (c: number) => `€ ${(c / 100).toFixed(2).replace(".", ",")}`;
const STATUSES = ["open", "herincasso", "opgelost", "afgeschreven"];

/** Admin → Fraude: storno's / terugvorderingen van teruggeboekte facturen. */
export function ClawbacksPanel() {
  const [data, setData] = useState<{ clawbacks: Clawback[]; exposureCents: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/admin/clawbacks", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => undefined);
  }, []);
  useEffect(() => load(), [load]);

  if (!data) return null;

  return (
    <section className="mt-6 rounded-2xl border border-hair bg-white">
      <div className="flex items-center justify-between border-b border-hair px-5 py-4">
        <div>
          <h2 className="font-display text-base font-bold text-ink">Storno&apos;s / terugvorderingen</h2>
          <p className="text-xs text-neutralx-500">Teruggeboekte facturen. Exposure = al uitbetaald en nog niet terugontvangen.</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${data.exposureCents > 0 ? "bg-crit/10 text-crit" : "bg-brand-50 text-brand-700"}`}>
          voorgeschoten: {eur(data.exposureCents)}
        </span>
      </div>
      {data.clawbacks.length === 0 ? (
        <p className="px-5 py-5 text-sm text-neutralx-500">Geen terugboekingen. 👍</p>
      ) : (
        <ul className="divide-y divide-hair">
          {data.clawbacks.map((c) => (
            <li key={c.invoiceId} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
              <span className="min-w-0">
                <span className="text-sm font-medium text-ink">{c.invoiceNumber}</span>
                <span className="ml-2 text-sm">{eur(c.amountCents)}</span>
                {c.workerPaid && <span className="ml-2 rounded-full bg-crit/10 px-2 py-0.5 text-[11px] text-crit">voorgeschoten</span>}
                <span className="block text-xs text-neutralx-500">{c.reason} · {new Date(c.at).toLocaleDateString("nl-NL")}</span>
              </span>
              <select
                value={c.status}
                disabled={busy === c.invoiceId}
                onChange={async (e) => {
                  setBusy(c.invoiceId);
                  await fetch("/api/admin/clawbacks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ invoiceId: c.invoiceId, status: e.target.value }) }).catch(() => undefined);
                  setBusy(null);
                  load();
                }}
                className="field-input w-auto py-1 text-xs"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
