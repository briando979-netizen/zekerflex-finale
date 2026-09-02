"use client";

import { useEffect, useState } from "react";

type Speed = "instant" | "threeDay" | "standard";

interface SpeedMeta {
  label: string;
  sub: string;
  feeRate: number;
  withinDays: number;
}
interface Advance {
  id: string;
  amountCents: number;
  feeCents: number;
  netCents: number;
  requestedAt: string;
  status: string;
}
interface Data {
  prefs: { speed: Speed };
  speeds: Record<Speed, SpeedMeta>;
  pendingPayoutCents: number;
  exampleFees: Record<Speed, number>;
  advances: Advance[];
  outstandingAdvanceCents: number;
  maxAdvanceCents: number;
  advanceFeeRatePct: number;
}

const euro = (c: number) => `€ ${(c / 100).toFixed(2).replace(".", ",")}`;

export function PayoutSpeedPanel() {
  const [d, setD] = useState<Data | null>(null);
  const [saving, setSaving] = useState(false);
  const [amount, setAmount] = useState("");
  const [advErr, setAdvErr] = useState<string | null>(null);
  const [advBusy, setAdvBusy] = useState(false);

  const load = () =>
    fetch("/api/me/payout", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setD(j))
      .catch(() => undefined);
  useEffect(() => {
    void load();
  }, []);

  const pick = async (speed: Speed) => {
    if (!d || saving) return;
    setSaving(true);
    setD({ ...d, prefs: { speed } });
    try {
      await fetch("/api/me/payout", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ speed }),
      });
    } finally {
      setSaving(false);
    }
  };

  const requestAdvance = async () => {
    const cents = Math.round(parseFloat(amount.replace(",", ".")) * 100);
    if (!Number.isFinite(cents) || cents <= 0) return;
    setAdvBusy(true);
    setAdvErr(null);
    try {
      const r = await fetch("/api/me/payout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents: cents }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => null);
        throw new Error(j?.error?.message ?? "Aanvraag mislukt");
      }
      setAmount("");
      await load();
    } catch (e) {
      setAdvErr((e as Error).message);
    } finally {
      setAdvBusy(false);
    }
  };

  if (!d) return null;
  const order: Speed[] = ["instant", "threeDay", "standard"];

  return (
    <div className="space-y-6">
      <section className="surface p-6">
        <p className="eyebrow">Uitbetaling</p>
        <h2 className="mt-1 font-display text-lg font-bold text-ink">Hoe snel wil je je geld?</h2>
        <p className="mt-1 text-sm text-neutralx-500">
          Je kiest per keer. De kosten worden ingehouden op de betreffende factuur — je nettobedrag is dus lager.
        </p>
        <div className="mt-4 grid gap-3">
          {order.map((s) => {
            const meta = d.speeds[s];
            const active = d.prefs.speed === s;
            const fee = d.exampleFees[s];
            return (
              <button
                key={s}
                type="button"
                onClick={() => pick(s)}
                className={`flex items-start gap-3 rounded-xl border p-4 text-left transition ${
                  active ? "border-brand-500 bg-brand-50" : "border-hairstrong hover:bg-paper-soft"
                }`}
              >
                <span
                  className={`mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center rounded-full border-2 ${
                    active ? "border-brand-500 bg-brand-500 text-white" : "border-hairstrong"
                  }`}
                >
                  {active ? "✓" : ""}
                </span>
                <span className="flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-ink">{meta.label}</span>
                    <span className="text-sm font-semibold text-ink">
                      {meta.feeRate > 0 ? `${Math.round(meta.feeRate * 100)}%` : "gratis"}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-xs text-neutralx-500">{meta.sub}</span>
                  {d.pendingPayoutCents > 0 && meta.feeRate > 0 && (
                    <span className="mt-1 block text-xs text-neutralx-400">
                      Nu ± {euro(fee)} kosten over {euro(d.pendingPayoutCents)} openstaand
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="surface p-6">
        <p className="eyebrow">Voorschot</p>
        <h2 className="mt-1 font-display text-lg font-bold text-ink">Nu al een deel opnemen</h2>
        <p className="mt-1 text-sm text-neutralx-500">
          Krijg een voorschot op je eerstvolgende betaling. Kosten: {d.advanceFeeRatePct}% over het voorschot,
          automatisch verrekend met je volgende uitbetaling.
        </p>

        {d.outstandingAdvanceCents > 0 && (
          <p className="mt-3 rounded-lg bg-warn/10 px-3 py-2 text-xs text-neutralx-700">
            Lopend voorschot: {euro(d.outstandingAdvanceCents)} — wordt van je volgende betaling afgetrokken.
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="field-label">Bedrag (€)</span>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0,00"
              className="field-input w-40"
            />
          </label>
          <button
            type="button"
            onClick={requestAdvance}
            disabled={advBusy || d.maxAdvanceCents <= 0}
            className="btn-primary disabled:opacity-40"
          >
            {advBusy ? "Aanvragen…" : "Voorschot aanvragen"}
          </button>
          <span className="text-xs text-neutralx-400">max {euro(d.maxAdvanceCents)}</span>
        </div>
        {advErr && <p className="mt-2 text-xs text-crit">{advErr}</p>}

        {d.advances.length > 0 && (
          <ul className="mt-4 divide-y divide-hair text-sm">
            {d.advances.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                <span>
                  {euro(a.amountCents)}{" "}
                  <span className="text-xs text-neutralx-400">
                    − {euro(a.feeCents)} kosten = {euro(a.netCents)} netto
                  </span>
                </span>
                <span className="text-xs text-neutralx-500">
                  {a.status === "settled" ? "verrekend" : a.status === "rejected" ? "afgewezen" : "in behandeling"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
