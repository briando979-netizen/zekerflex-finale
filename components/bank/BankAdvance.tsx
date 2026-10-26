"use client";

import { useCallback, useEffect, useState } from "react";
import { fireCoins } from "@/components/ui/confetti";

interface PayoutInfo {
  pendingPayoutCents: number;
  maxAdvanceCents: number;
  outstandingAdvanceCents: number;
  advanceFeeRatePct: number;
  advanceToBank: boolean;
}

const euro = (c: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(c / 100);

/** Voorschot op verdiensten — instantly on ZekerFlex Bank. */
export function BankAdvance({ onChanged }: { onChanged: (n: { ok: boolean; text: string }) => void | Promise<void> }) {
  const [info, setInfo] = useState<PayoutInfo | null>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/me/payout", { cache: "no-store" }).catch(() => null);
    if (r?.ok) setInfo(await r.json());
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  if (!info || !info.advanceToBank || (info.maxAdvanceCents <= 0 && info.outstandingAdvanceCents <= 0)) return null;
  const cents = Math.round(Number(amount.replace(",", ".")) * 100);
  const fee = Number.isFinite(cents) ? Math.round((cents * info.advanceFeeRatePct) / 100) : 0;

  return (
    <div className="card space-y-3 border-brand-500/30 bg-gradient-to-br from-brand-50/50 to-transparent p-5">
      <div className="flex flex-wrap items-end gap-3">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink">⚡ Voorschot op je verdiensten</span>
          <span className="block text-xs text-neutralx-500">
            {euro(info.pendingPayoutCents)} onderweg · tot {euro(info.maxAdvanceCents)} nu direct op je rekening ({info.advanceFeeRatePct}% vergoeding)
          </span>
        </span>
      </div>
      {info.maxAdvanceCents >= 500 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-neutralx-500">€</span>
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={(info.maxAdvanceCents / 100).toFixed(0)} className="w-28 rounded-lg border border-hairstrong bg-white px-3 py-2 text-sm" />
          <button
            type="button"
            disabled={busy || !(cents >= 500) || cents > info.maxAdvanceCents}
            onClick={async () => {
              setBusy(true);
              const res = await fetch("/api/me/payout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amountCents: cents }) }).catch(() => null);
              const d = res ? await res.json().catch(() => ({})) : {};
              setBusy(false);
              setAmount("");
              if (res?.ok) fireCoins();
              await onChanged(res?.ok ? { ok: true, text: `${euro(cents - fee)} staat op je rekening. Wordt verrekend met je volgende uitbetaling.` } : { ok: false, text: d?.error?.message ?? "Voorschot lukte niet." });
              await load();
            }}
            className="btn-primary text-sm disabled:opacity-50"
          >
            {cents >= 500 ? `Ontvang ${euro(cents - fee)} nu` : "Voorschot opnemen"}
          </button>
        </div>
      )}
      {info.outstandingAdvanceCents > 0 && <p className="text-xs text-neutralx-500">Lopend voorschot: {euro(info.outstandingAdvanceCents)} — wordt verrekend met je volgende uitbetaling.</p>}
    </div>
  );
}
