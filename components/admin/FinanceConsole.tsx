"use client";

import { useCallback, useEffect, useState } from "react";

interface Settings {
  stripeFeePct: number;
  vatInputPct: number;
  operationalMonthlyCents: number;
  taxReservePct: number;
  uitzendMarkupRate: number | null;
}
interface Overview {
  months: number;
  revenue: { platformFee: number; uitzendMargin: number; shop: number; fastPay: number; total: number };
  passthrough: { uitzendWages: number; freelancerInvoices: number; penalties: number; total: number };
  grossInvoiced: number;
  vat: { output: number; inputEstimate: number; due: number };
  costs: { stripe: number; operational: number; total: number };
  netProfit: number;
  taxReserve: number;
  distributable: number;
  settings: Settings;
}

const eur = (c: number) => `€ ${(c / 100).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (f: number) => `${(f * 100).toLocaleString("nl-NL", { maximumFractionDigits: 2 })}%`;

const PERIODS: { id: string; label: string }[] = [
  { id: "month", label: "Deze maand" },
  { id: "year", label: "Dit jaar" },
  { id: "all", label: "Alles" },
];

export function FinanceConsole() {
  const [period, setPeriod] = useState("year");
  const [data, setData] = useState<Overview | null>(null);
  const [edit, setEdit] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (p: string) => {
    const r = await fetch(`/api/admin/financien?period=${p}`, { cache: "no-store" });
    if (r.ok) {
      const d = await r.json();
      setData(d.overview);
      setEdit(d.overview.settings);
    }
  }, []);

  useEffect(() => {
    void load(period);
  }, [period, load]);

  const save = async () => {
    if (!edit) return;
    setSaving(true);
    try {
      const r = await fetch("/api/admin/financien", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(edit),
      });
      if (r.ok) await load(period);
    } finally {
      setSaving(false);
    }
  };

  const card = { background: "var(--a-elev)", border: "1px solid var(--a-border)" };
  const text = { color: "var(--a-text)" };
  const mute = { color: "var(--a-mute)" };

  return (
    <div className="space-y-5">
      {/* period toggle */}
      <div className="flex gap-2">
        {PERIODS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPeriod(p.id)}
            className="rounded-lg px-3 py-1.5 text-sm font-semibold"
            style={period === p.id ? { background: "var(--a-accent, #0E5C4A)", color: "#fff" } : { background: "var(--a-elev)", border: "1px solid var(--a-border)", color: "var(--a-text)" }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {!data ? (
        <div className="h-40 animate-pulse rounded-xl" style={{ background: "var(--a-elev)" }} />
      ) : (
        <>
          {/* top KPIs */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Jouw omzet (marge)" value={eur(data.revenue.total)} sub="platformfee + uitzendopslag" />
            <Kpi label="Nettowinst" value={eur(data.netProfit)} sub="omzet − kosten" tone={data.netProfit >= 0 ? "up" : "down"} />
            <Kpi label="Uitkeerbaar — eigen geld" value={eur(data.distributable)} sub="na belastingreservering" tone="up" />
            <Kpi label="Btw af te dragen" value={eur(data.vat.due)} sub="output − voorbelasting" tone={data.vat.due > 0 ? "down" : "up"} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Block title="Jouw omzet (marge)">
              <Row k="Platformkosten (€/uur)" v={eur(data.revenue.platformFee)} />
              <Row k="Uitzendopslag (bemiddeling + lasten)" v={eur(data.revenue.uitzendMargin)} />
              <Row k="Webshop" v={eur(data.revenue.shop)} />
              <Row k="Snelle uitbetaling / voorschot (fees)" v={eur(data.revenue.fastPay)} />
              <Row k="Totaal eigen omzet" v={eur(data.revenue.total)} strong />
            </Block>

            <Block title="Doorlopende posten (geen winst)">
              <Row k="Uitzendloon (naar krachten)" v={eur(data.passthrough.uitzendWages)} />
              <Row k="Freelancer-facturen (reverse billing)" v={eur(data.passthrough.freelancerInvoices)} />
              <Row k="Annulerings-/no-show-claims" v={eur(data.passthrough.penalties)} />
              <Row k="Totaal doorloop" v={eur(data.passthrough.total)} strong />
            </Block>

            <Block title="Kosten (indicatief)">
              <Row k={`Stripe-/betaalkosten (${pct(data.settings.stripeFeePct)})`} v={eur(data.costs.stripe)} />
              <Row k={`Vaste maandlasten × ${data.months} mnd`} v={eur(data.costs.operational)} />
              <Row k="Totaal kosten" v={eur(data.costs.total)} strong />
            </Block>

            <Block title="Btw-positie (indicatief)">
              <Row k="Btw op je verkoopfacturen (output)" v={eur(data.vat.output)} />
              <Row k={`Geschatte voorbelasting (${pct(data.settings.vatInputPct)})`} v={`− ${eur(data.vat.inputEstimate)}`} />
              <Row k="Af te dragen / terug" v={eur(data.vat.due)} strong />
            </Block>

            <Block title="Winst & eigen geld">
              <Row k="Nettowinst (excl. btw)" v={eur(data.netProfit)} />
              <Row k={`Belastingreservering (${pct(data.settings.taxReservePct)})`} v={`− ${eur(data.taxReserve)}`} />
              <Row k="Uitkeerbaar naar holding/privé" v={eur(data.distributable)} strong />
            </Block>

            <Block title="Bruto gefactureerd">
              <Row k="Totaal gefactureerd (incl. doorloop + btw)" v={eur(data.grossInvoiced)} />
              <p className="px-1 pt-2 text-xs" style={mute}>
                Dit is alles wat er door het platform stroomt — het meeste is geen winst maar loon/facturen die doorbetaald worden.
              </p>
            </Block>
          </div>

          {/* settings */}
          {edit && (
            <div className="rounded-xl p-4" style={card}>
              <p className="mb-1 text-sm font-semibold" style={text}>
                Tarieven & reserveringen
              </p>
              <p className="mb-3 text-xs" style={mute}>
                Btw, belasting en kosten zijn <b>indicatief</b> op basis van deze tarieven — stel ze op jouw situatie in en laat je
                boekhouder ze bevestigen. Alleen de omzet- en factuurbedragen komen rechtstreeks uit je echte facturen.
              </p>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <Field label="Stripe-kosten %" value={edit.stripeFeePct * 100} onChange={(n) => setEdit({ ...edit, stripeFeePct: n / 100 })} />
                <Field label="Voorbelasting (btw) %" value={edit.vatInputPct * 100} onChange={(n) => setEdit({ ...edit, vatInputPct: n / 100 })} />
                <Field label="Belastingreservering %" value={edit.taxReservePct * 100} onChange={(n) => setEdit({ ...edit, taxReservePct: n / 100 })} />
                <Field label="Vaste maandlasten €" value={edit.operationalMonthlyCents / 100} onChange={(n) => setEdit({ ...edit, operationalMonthlyCents: Math.round(n * 100) })} />
                <Field
                  label="Uitzendopslag % (leeg = standaard)"
                  value={edit.uitzendMarkupRate === null ? NaN : edit.uitzendMarkupRate * 100}
                  onChange={(n) => setEdit({ ...edit, uitzendMarkupRate: Number.isFinite(n) ? n / 100 : null })}
                  allowEmpty
                />
              </div>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="mt-3 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: "var(--a-accent, #0E5C4A)" }}
              >
                {saving ? "Opslaan…" : "Tarieven opslaan"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "up" | "down" }) {
  return (
    <div className="rounded-xl p-4" style={{ background: "var(--a-elev)", border: "1px solid var(--a-border)" }}>
      <p className="text-xs font-medium" style={{ color: "var(--a-mute)" }}>{label}</p>
      <p className="mt-1 font-display text-2xl font-bold" style={{ color: tone === "down" ? "#f87171" : tone === "up" ? "#34d399" : "var(--a-text)" }}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs" style={{ color: "var(--a-mute)" }}>{sub}</p>}
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-4" style={{ background: "var(--a-elev)", border: "1px solid var(--a-border)" }}>
      <p className="mb-2 text-sm font-semibold" style={{ color: "var(--a-text)" }}>{title}</p>
      <div className="divide-y" style={{ borderColor: "var(--a-border)" }}>{children}</div>
    </div>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 text-sm">
      <span style={{ color: strong ? "var(--a-text)" : "var(--a-mute)", fontWeight: strong ? 600 : 400 }}>{k}</span>
      <span className="font-mono" style={{ color: "var(--a-text)", fontWeight: strong ? 700 : 500 }}>{v}</span>
    </div>
  );
}

function Field({ label, value, onChange, allowEmpty }: { label: string; value: number; onChange: (n: number) => void; allowEmpty?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs" style={{ color: "var(--a-mute)" }}>{label}</span>
      <input
        type="number"
        step="0.01"
        defaultValue={Number.isFinite(value) ? value : ""}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "" && allowEmpty) onChange(NaN);
          else onChange(Number(raw));
        }}
        className="w-full rounded-lg px-2.5 py-1.5 text-sm"
        style={{ background: "var(--a-panel)", border: "1px solid var(--a-border)", color: "var(--a-text)" }}
      />
    </label>
  );
}
