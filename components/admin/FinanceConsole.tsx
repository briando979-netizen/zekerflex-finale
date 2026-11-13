"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { euro, euroExact } from "@/lib/admin/format";
import { InfoList, KpiStrip, PageHead, Panel, StackBar } from "@/components/admin/kit";

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
  operationalSource?: { monthlyCents: number; soort: "kosten" | "instelling"; tekst: string; onbekend: number; zonderBtw?: number; breakEvenMonthlyCents: number };
  netProfit: number;
  taxReserve: number;
  distributable: number;
  settings: Settings;
}

const pct = (f: number) => `${(f * 100).toLocaleString("nl-NL", { maximumFractionDigits: 2 })}%`;

const PERIODS: { id: string; label: string }[] = [
  { id: "month", label: "Deze maand" },
  { id: "year", label: "Dit jaar" },
  { id: "all", label: "Alles" },
];

/** Van omzet naar eigen geld: elke stap zichtbaar, de eindstand vet. */
function Bridge({ data }: { data: Overview }) {
  const steps = [
    { label: "Eigen omzet", value: data.revenue.total, sign: "" },
    { label: "Betaalkosten en vaste lasten", value: data.costs.total, sign: "−" },
    { label: "Nettowinst", value: data.netProfit, sign: "=", strong: true },
    { label: `Belastingreservering (${pct(data.settings.taxReservePct)})`, value: data.taxReserve, sign: "−" },
    { label: "Eigen geld, uitkeerbaar", value: data.distributable, sign: "=", strong: true },
  ];
  const max = Math.max(1, ...steps.map((s) => Math.abs(s.value)));
  return (
    <ol className="space-y-2.5">
      {steps.map((s) => (
        <li key={s.label}>
          <span className="mb-1 flex items-baseline justify-between gap-3 text-[0.8125rem]">
            <span className="min-w-0 truncate" style={{ color: s.strong ? "var(--a-text)" : "var(--a-dim)", fontWeight: s.strong ? 600 : 400 }}>{s.label}</span>
            <span className="num flex-shrink-0" style={{ color: "var(--a-text)", fontWeight: s.strong ? 600 : 500 }}>{s.sign === "−" ? "− " : ""}{euroExact(s.value)}</span>
          </span>
          <span className="block h-1.5 overflow-hidden rounded-full" style={{ background: "var(--a-elev)" }}>
            <span className="block h-full rounded-full" style={{ width: `${(Math.abs(s.value) / max) * 100}%`, background: s.sign === "−" ? "var(--a-other)" : s.value < 0 ? "var(--a-crit)" : "var(--a-s1)" }} />
          </span>
        </li>
      ))}
    </ol>
  );
}

export function FinanceConsole({ chart }: { chart?: ReactNode }) {
  const [period, setPeriod] = useState("year");
  const [data, setData] = useState<Overview | null>(null);
  const [edit, setEdit] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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
    setSaved(false);
    try {
      const r = await fetch("/api/admin/financien", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(edit),
      });
      if (r.ok) {
        await load(period);
        setSaved(true);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHead
        title="Financiën & winst"
        subtitle="Je echte omzet en marge, los van doorlopende posten, met btw, kosten en wat je eruit kunt halen."
        actions={
          <nav aria-label="Periode" className="inline-flex rounded-lg p-0.5" style={{ background: "var(--a-elev)" }}>
            {PERIODS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriod(p.id)}
                aria-pressed={period === p.id}
                className="rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
                style={period === p.id ? { background: "var(--a-panel)", color: "var(--a-text)", boxShadow: "var(--a-shadow-sm)" } : { color: "var(--a-mute)" }}
              >
                {p.label}
              </button>
            ))}
          </nav>
        }
      />

      {period === "all" && (
        <p className="text-xs" style={{ color: "var(--a-mute)" }}>
          Bij de periode Alles wordt het huidige maandtotaal van de vaste lasten teruggerekend over de hele periode. Kosten die later begonnen, kunnen daardoor te hoog uitvallen.
        </p>
      )}

      {!data ? (
        <div className="a-panel h-28 animate-pulse" />
      ) : (
        <>
          <KpiStrip
            items={[
              { label: "Eigen omzet", value: euro(data.revenue.total), hint: "marge, zonder btw" },
              { label: "Nettowinst", value: euro(data.netProfit), hint: "omzet min kosten", ...(data.netProfit < 0 ? { tone: "crit" as const } : {}) },
              { label: "Eigen geld", value: euro(data.distributable), hint: "na belastingreservering", tone: "money" },
              { label: "Btw af te dragen", value: euro(data.vat.due), hint: "indicatief" },
              { label: "Door het platform", value: euro(data.grossInvoiced), hint: "inclusief doorloop en btw" },
            ]}
          />

          <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
            {chart}
            <Panel title="Van omzet naar eigen geld" subtitle="Kosten en belasting zijn indicatief">
              <Bridge data={data} />
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Waar je omzet vandaan komt">
              <StackBar
                format={euro}
                emptyText="Nog geen omzet in deze periode."
                segments={[
                  { label: "Platformkosten (€/uur)", value: data.revenue.platformFee, slot: 1 },
                  { label: "Uitzendopslag", value: data.revenue.uitzendMargin, slot: 2 },
                  { label: "Webshop", value: data.revenue.shop, slot: 3 },
                  { label: "Snelle uitbetaling", value: data.revenue.fastPay, slot: 4 },
                ]}
              />
            </Panel>
            <Panel title="Doorlopende posten" subtitle="Geen winst: dit betaal je weer door">
              <StackBar
                format={euro}
                emptyText="Nog geen doorlopende posten in deze periode."
                segments={[
                  { label: "Uitzendloon", value: data.passthrough.uitzendWages, slot: 1 },
                  { label: "Freelancer-facturen", value: data.passthrough.freelancerInvoices, slot: 2 },
                  { label: "Annulerings- en no-show-claims", value: data.passthrough.penalties, slot: 3 },
                ]}
              />
            </Panel>
            <Panel title="Kosten" subtitle="Indicatief">
              <InfoList
                rows={[
                  { label: `Stripe- en betaalkosten (${pct(data.settings.stripeFeePct)})`, value: euroExact(data.costs.stripe) },
                  { label: `Vaste maandlasten × ${data.months} mnd`, value: euroExact(data.costs.operational) },
                  { label: "Totaal", value: euroExact(data.costs.total) },
                  ...(data.operationalSource ? [{ label: "Break-even: eigen omzet per maand voor de vaste lasten", value: euroExact(data.operationalSource.breakEvenMonthlyCents) }] : []),
                ]}
              />
              {data.operationalSource && (
                <p role={data.operationalSource.soort === "instelling" ? "alert" : "status"} className="mt-2 text-xs" style={{ color: data.operationalSource.soort === "instelling" ? "var(--a-warn)" : "var(--a-mute)" }}>
                  {data.operationalSource.tekst}
                  {data.operationalSource.soort === "kosten" && data.operationalSource.onbekend > 0 ? ` ${data.operationalSource.onbekend} posten zonder bedrag staan niet in dit totaal.` : ""}
                </p>
              )}
            </Panel>
            <Panel title="Btw-positie" subtitle="Indicatief">
              <InfoList
                rows={[
                  { label: "Btw op je verkoopfacturen", value: euroExact(data.vat.output) },
                  { label: data.operationalSource?.soort === "kosten" ? "Geschatte voorbelasting (alleen posten met Nederlandse btw)" : `Geschatte voorbelasting (${pct(data.settings.vatInputPct)})`, value: `− ${euroExact(data.vat.inputEstimate)}` },
                  { label: "Af te dragen of terug", value: euroExact(data.vat.due) },
                ]}
              />
              {data.operationalSource?.soort === "kosten" && (data.operationalSource.zonderBtw ?? 0) > 0 && (
                <p className="mt-2 text-xs" style={{ color: "var(--a-mute)" }}>
                  {data.operationalSource.zonderBtw} posten met onbekende btw tellen niet mee in de voorbelasting. Stripe-kosten tellen er ook niet in mee. Dit is een schatting.
                </p>
              )}
            </Panel>
          </div>

          {edit && (
            <Panel title="Tarieven & reserveringen" subtitle="Btw, belasting en kosten rekenen met deze tarieven: stel ze in op jouw situatie en laat je boekhouder ze bevestigen. Alleen omzet- en factuurbedragen komen rechtstreeks uit je echte facturen.">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <Field label="Stripe-kosten %" value={edit.stripeFeePct * 100} onChange={(n) => setEdit({ ...edit, stripeFeePct: n / 100 })} />
                <Field label="Voorbelasting (btw) %" value={edit.vatInputPct * 100} onChange={(n) => setEdit({ ...edit, vatInputPct: n / 100 })} />
                <Field label="Belastingreservering %" value={edit.taxReservePct * 100} onChange={(n) => setEdit({ ...edit, taxReservePct: n / 100 })} />
                <Field label="Vaste maandlasten € (alleen als Beheer → Kosten niet is ingevuld)" value={edit.operationalMonthlyCents / 100} onChange={(n) => setEdit({ ...edit, operationalMonthlyCents: Math.round(n * 100) })} />
                <Field
                  label="Uitzendopslag % (leeg = standaard)"
                  value={edit.uitzendMarkupRate === null ? NaN : edit.uitzendMarkupRate * 100}
                  onChange={(n) => setEdit({ ...edit, uitzendMarkupRate: Number.isFinite(n) ? n / 100 : null })}
                  allowEmpty
                />
              </div>
              <div className="mt-3 flex items-center gap-3">
                <button type="button" onClick={save} disabled={saving} className="a-button a-button-primary">
                  {saving ? "Opslaan…" : "Tarieven opslaan"}
                </button>
                {saved && <span className="text-xs" style={{ color: "var(--a-ok)" }}>Opgeslagen</span>}
              </div>
            </Panel>
          )}
        </>
      )}
    </div>
  );
}

function Field({ label, value, onChange, allowEmpty }: { label: string; value: number; onChange: (n: number) => void; allowEmpty?: boolean }) {
  return (
    <label className="a-label">
      {label}
      <input
        type="number"
        step="0.01"
        defaultValue={Number.isFinite(value) ? value : ""}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "" && allowEmpty) onChange(NaN);
          else onChange(Number(raw));
        }}
        className="a-input"
      />
    </label>
  );
}
