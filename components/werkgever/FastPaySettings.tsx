"use client";

import { useEffect, useState } from "react";
import { useT } from "@/components/i18n/I18nProvider";

interface Settings {
  offerFastPay: boolean;
  advancesForUitzend: boolean;
  available: boolean;
  credit: { status: "none" | "approved" | "review" | "rejected"; score: number; reasons: string[]; checkedAt: string };
}

const STATUS_CLS: Record<Settings["credit"]["status"], string> = {
  none: "bg-paper-soft text-neutralx-600",
  approved: "bg-ok/10 text-ok",
  review: "bg-warn/10 text-warn",
  rejected: "bg-crit/10 text-crit",
};

/** Werkgever: offer fast payout (after a credit check) and uitzend advances. */
export function FastPaySettings() {
  const f = useT().fastPayForm;
  const [s, setS] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/werkgever/fastpay", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setS(d));
  }, []);

  async function save(patch: Partial<Pick<Settings, "offerFastPay" | "advancesForUitzend">>) {
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/werkgever/fastpay", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (!r?.ok) return setErr(d?.error?.message ?? f.opslaanMislukt);
    setS(d);
  }

  if (!s) return null;
  const st = {
    label: { none: f.geen, approved: f.goedgekeurd, review: f.beoordeling, rejected: f.afgewezen }[s.credit.status],
    cls: STATUS_CLS[s.credit.status],
  };

  return (
    <div className="card space-y-4 p-5">
      <div>
        <p className="text-sm font-semibold text-ink">{f.kop}</p>
        <p className="mt-1 text-xs leading-relaxed text-neutralx-500">
          {f.uitleg}
        </p>
      </div>
      <label className="flex items-center justify-between gap-3 text-sm">
        <span>{f.aanbieden}</span>
        <input type="checkbox" checked={s.offerFastPay} disabled={busy} onChange={(e) => save({ offerFastPay: e.target.checked })} />
      </label>
      {(s.offerFastPay || s.credit.status !== "none") && (
        <div className="rounded-xl border border-hair bg-paper-soft/60 p-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-ink">{f.krediet}</span>
            <span className={`rounded-full px-2 py-0.5 font-semibold ${st.cls}`}>{st.label}</span>
            {s.credit.score > 0 && <span className="text-neutralx-400">{s.credit.score}/100</span>}
          </div>
          {s.credit.reasons.length > 0 && (
            <ul className="mt-2 list-disc space-y-0.5 pl-4 text-neutralx-600">
              {s.credit.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-neutralx-500">
            {s.available
              ? f.actief
              : s.credit.status === "review"
                ? f.inBeoordeling
                : s.credit.status === "rejected"
                  ? f.nuNiet
                  : f.zetAan}
          </p>
        </div>
      )}
      <label className="flex items-start justify-between gap-3 border-t border-hair pt-4 text-sm">
        <span>
          <span className="block">{f.voorschotKop}</span>
          <span className="block text-xs text-neutralx-500">{f.voorschotUitleg}</span>
        </span>
        <input type="checkbox" checked={s.advancesForUitzend} disabled={busy} onChange={(e) => save({ advancesForUitzend: e.target.checked })} className="mt-1" />
      </label>
      {err && <p role="alert" className="text-sm text-crit">{err}</p>}
    </div>
  );
}
