"use client";

import { useState } from "react";

export interface InsuranceProduct {
  id: string;
  name: string;
  description: string;
  coverage: string;
  insurer: string;
  monthlyPremiumCents: number;
}
export interface Policy {
  id: string;
  productId: string;
  productName: string;
  insurer: string;
  premiumCents: number;
  status: "requested" | "active" | "rejected" | "cancelled";
  requestedAt: string;
  nextPremiumAt?: string;
  arrears?: boolean;
  policyNumber?: string;
  note?: string;
}

const euro = (c: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(c / 100);
const ICON: Record<string, string> = { aov: "🩺", avb: "🛡️", ongevallen: "🚑", rechtsbijstand: "⚖️", gereedschap: "🧰", verzuim: "🏥" };
const STATUS: Record<Policy["status"], { label: string; cls: string }> = {
  requested: { label: "aangevraagd — we regelen het met de verzekeraar", cls: "bg-warn/10 text-warn" },
  active: { label: "verzekerd", cls: "bg-ok/10 text-ok" },
  rejected: { label: "afgewezen", cls: "bg-crit/10 text-crit" },
  cancelled: { label: "opgezegd", cls: "bg-paper-soft text-neutralx-500" },
};

export function BankInsurance(props: {
  products: InsuranceProduct[];
  policies: Policy[];
  canManage: boolean;
  onChanged: (note: { ok: boolean; text: string }) => void | Promise<void>;
}) {
  const { products, policies, canManage, onChanged } = props;
  const [busy, setBusy] = useState(false);
  const open = new Map(policies.filter((p) => p.status === "requested" || p.status === "active").map((p) => [p.productId, p]));

  async function call(url: string, method: string, body: unknown, ok: string) {
    setBusy(true);
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? null : JSON.stringify(body) }).catch(() => null);
    setBusy(false);
    const d = res ? await res.json().catch(() => ({})) : {};
    await onChanged(res?.ok ? { ok: true, text: ok } : { ok: false, text: d?.error?.message ?? "Dat lukte niet." });
  }

  const monthly = policies.filter((p) => p.status === "active").reduce((s, p) => s + p.premiumCents, 0);

  return (
    <div className="space-y-5">
      {policies.length > 0 && (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-hair px-5 py-3">
            <span className="text-sm font-semibold">Mijn verzekeringen</span>
            {monthly > 0 && <span className="text-xs text-neutralx-500">{euro(monthly)} per maand</span>}
          </div>
          <ul className="divide-y divide-hair">
            {policies.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                <span className="text-xl">{ICON[p.productId] ?? "🛡️"}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-ink">{p.productName}</span>
                  <span className="block text-xs text-neutralx-500">
                    {p.insurer}
                    {p.policyNumber ? ` · polis ${p.policyNumber}` : ""}
                    {p.status === "active" && p.nextPremiumAt ? ` · volgende premie ${new Date(p.nextPremiumAt).toLocaleDateString("nl-NL")}` : ""}
                    {p.note ? ` · ${p.note}` : ""}
                  </span>
                  {p.arrears && <span className="mt-0.5 block text-xs font-semibold text-crit">Premie niet betaald — vul je saldo aan, anders vervalt de dekking.</span>}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS[p.status].cls}`}>{STATUS[p.status].label}</span>
                {canManage && (p.status === "active" || p.status === "requested") && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => window.confirm(`${p.productName} opzeggen?`) && call(`/api/me/bank/insurance/${p.id}`, "DELETE", undefined, "Verzekering opgezegd — er wordt geen premie meer afgeschreven.")}
                    className="text-xs text-neutralx-500 hover:text-crit hover:underline"
                  >
                    Opzeggen
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {products.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-3xl">🛡️</p>
          <p className="mt-2 font-semibold text-ink">Verzekeren via ZekerFlex komt eraan</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-neutralx-500">We werken aan arbeidsongeschiktheid, aansprakelijkheid, rechtsbijstand en meer — met de premie direct van je saldo.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {products.map((p) => {
            const mine = open.get(p.id);
            return (
              <div key={p.id} className="card flex flex-col p-5">
                <div className="flex items-start gap-3">
                  <span className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-2xl bg-paper-soft text-2xl">{ICON[p.id] ?? "🛡️"}</span>
                  <span className="min-w-0">
                    <span className="block font-semibold text-ink">{p.name}</span>
                    <span className="block text-xs text-neutralx-500">via {p.insurer}</span>
                  </span>
                </div>
                <p className="mt-3 text-sm text-neutralx-700">{p.description}</p>
                <p className="mt-1 text-xs text-neutralx-500">{p.coverage}</p>
                <div className="mt-auto flex items-center justify-between gap-3 pt-4">
                  <span>
                    <span className="num font-display text-lg font-bold text-ink">{euro(p.monthlyPremiumCents)}</span>
                    <span className="text-xs text-neutralx-500"> /maand</span>
                  </span>
                  {mine ? (
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS[mine.status].cls}`}>{mine.status === "active" ? "verzekerd" : "aangevraagd"}</span>
                  ) : (
                    canManage && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => call("/api/me/bank/insurance", "POST", { productId: p.id }, `${p.name} aangevraagd. We regelen het met ${p.insurer}; pas na bevestiging wordt de eerste premie afgeschreven.`)}
                        className="btn-primary text-xs disabled:opacity-50"
                      >
                        Aanvragen
                      </button>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-xs leading-relaxed text-neutralx-400">
        De verzekeraar draagt het risico en de polisvoorwaarden van de verzekeraar gelden. ZekerFlex regelt de aanvraag en int de premie maandelijks van je ZekerFlex Bank-saldo.
      </p>
    </div>
  );
}
