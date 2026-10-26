"use client";

import { useEffect, useState } from "react";

interface Settings {
  offerFastPay: boolean;
  advancesForUitzend: boolean;
  available: boolean;
  credit: { status: "none" | "approved" | "review" | "rejected"; score: number; reasons: string[]; checkedAt: string };
}

const STATUS: Record<Settings["credit"]["status"], { label: string; cls: string }> = {
  none: { label: "Nog niet beoordeeld", cls: "bg-paper-soft text-neutralx-600" },
  approved: { label: "Goedgekeurd", cls: "bg-ok/10 text-ok" },
  review: { label: "In beoordeling bij ZekerFlex", cls: "bg-warn/10 text-warn" },
  rejected: { label: "Nu niet mogelijk", cls: "bg-crit/10 text-crit" },
};

/** Werkgever: offer fast payout (after a credit check) and uitzend advances. */
export function FastPaySettings() {
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
    if (!r?.ok) return setErr(d?.error?.message ?? "Opslaan lukte niet.");
    setS(d);
  }

  if (!s) return null;
  const st = STATUS[s.credit.status];

  return (
    <div className="card space-y-4 p-5">
      <div>
        <p className="text-sm font-semibold text-ink">⚡ Snelle uitbetaling voor je krachten</p>
        <p className="mt-1 text-xs leading-relaxed text-neutralx-500">
          Bied freelancers aan om binnen 1 minuut of 3 werkdagen na jouw goedkeuring betaald te worden. ZekerFlex neemt hun factuur over en jij betaalt gewoon op je eigen termijn. Klussen met snelle uitbetaling trekken sneller reacties. Hiervoor doen we eerst een kredietcheck (Handelsregister + je betaalgedrag bij ZekerFlex).
        </p>
      </div>
      <label className="flex items-center justify-between gap-3 text-sm">
        <span>Snelle uitbetaling aanbieden</span>
        <input type="checkbox" checked={s.offerFastPay} disabled={busy} onChange={(e) => save({ offerFastPay: e.target.checked })} />
      </label>
      {(s.offerFastPay || s.credit.status !== "none") && (
        <div className="rounded-xl border border-hair bg-paper-soft/60 p-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-ink">Kredietcheck</span>
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
              ? "Actief: bij je klussen staat dat snelle uitbetaling mogelijk is."
              : s.credit.status === "review"
                ? "We beoordelen je aanvraag; je hoort binnen 2 werkdagen van ons."
                : s.credit.status === "rejected"
                  ? "Op dit moment niet mogelijk. Na een paar maanden op tijd betalen kun je het opnieuw aanvragen."
                  : "Zet de schakelaar aan om de kredietcheck te starten."}
          </p>
        </div>
      )}
      <label className="flex items-start justify-between gap-3 border-t border-hair pt-4 text-sm">
        <span>
          <span className="block">Voorschot voor uitzendkrachten</span>
          <span className="block text-xs text-neutralx-500">Uitzendkrachten krijgen binnen 1 minuut na jouw goedkeuring ongeveer de helft van hun bruto loon als voorschot; de rest volgt op hun loonstrook.</span>
        </span>
        <input type="checkbox" checked={s.advancesForUitzend} disabled={busy} onChange={(e) => save({ advancesForUitzend: e.target.checked })} className="mt-1" />
      </label>
      {err && <p role="alert" className="text-sm text-crit">{err}</p>}
    </div>
  );
}
