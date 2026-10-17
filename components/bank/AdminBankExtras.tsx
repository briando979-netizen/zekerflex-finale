"use client";

import { useCallback, useEffect, useState } from "react";

interface Product {
  id: string;
  name: string;
  description: string;
  coverage: string;
  insurer: string;
  monthlyPremiumCents: number;
  audience: "personal" | "organisation" | "all";
  active: boolean;
}
interface Policy {
  id: string;
  holderName: string;
  productName: string;
  insurer: string;
  premiumCents: number;
  status: "requested" | "active" | "rejected" | "cancelled";
  requestedAt: string;
  arrears?: boolean;
  policyNumber?: string;
}

const euro = (c: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(c / 100);
const AUD: Record<Product["audience"], string> = { personal: "Freelancers", organisation: "Bedrijven", all: "Iedereen" };

/** /admin/bank: insurance catalogue + policy requests, and savings rates. */
export function AdminBankExtras() {
  const [products, setProducts] = useState<Product[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [rates, setRates] = useState<{ years: string; pct: string }[]>([]);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const [i, r] = await Promise.all([fetch("/api/admin/bank/insurance", { cache: "no-store" }), fetch("/api/admin/bank/rates", { cache: "no-store" })]);
    if (i.ok) {
      const d = await i.json();
      setProducts(d.products);
      setPolicies(d.policies);
    }
    if (r.ok) {
      const d: { rates: Record<string, number> } = await r.json();
      setRates(
        Object.entries(d.rates)
          .sort((a, b) => Number(a[0]) - Number(b[0]))
          .map(([years, bps]) => ({ years, pct: (bps / 100).toFixed(2).replace(".", ",") })),
      );
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function call(url: string, method: string, body: unknown, ok: string) {
    setNote(null);
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const d = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) return setNote({ ok: false, text: d?.error?.message ?? "Mislukt." });
    setNote({ ok: true, text: ok });
    await load();
  }

  const upd = (i: number, patch: Partial<Product>) => setProducts(products.map((p, n) => (n === i ? { ...p, ...patch } : p)));
  const inp = "w-full rounded-lg border border-hairstrong bg-white px-2 py-1.5 text-sm";
  const requests = policies.filter((p) => p.status === "requested");
  const active = policies.filter((p) => p.status === "active");

  return (
    <div className="space-y-6">
      {note && <p className={`rounded-xl px-4 py-3 text-sm ${note.ok ? "bg-ok/10 text-ok" : "bg-crit/10 text-crit"}`}>{note.text}</p>}

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-hair px-5 py-3">
          <span className="text-sm font-semibold">Verzekeringsaanvragen ({requests.length})</span>
          <span className="ml-auto text-xs text-neutralx-500">
            {active.length} actieve polissen · {euro(active.reduce((s, p) => s + p.premiumCents, 0))}/mnd premie
          </span>
        </div>
        {policies.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-neutralx-400">Nog geen aanvragen.</p>
        ) : (
          <ul className="divide-y divide-hair text-sm">
            {policies.slice(0, 100).map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-ink">
                    {p.holderName} — {p.productName}
                  </span>
                  <span className="block text-xs text-neutralx-500">
                    {p.insurer} · {euro(p.premiumCents)}/mnd · {new Date(p.requestedAt).toLocaleDateString("nl-NL")}
                    {p.policyNumber ? ` · polis ${p.policyNumber}` : ""}
                    {p.arrears ? " · ACHTERSTAND" : ""}
                  </span>
                </span>
                <span className="text-xs text-neutralx-500">{p.status}</span>
                {p.status === "requested" && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        const nr = window.prompt(`Polisnummer van ${p.insurer}? (eerste premie wordt direct geïnd)`);
                        if (nr) void call("/api/admin/bank/insurance", "POST", { action: "activate", id: p.id, policyNumber: nr }, "Polis actief.");
                      }}
                      className="text-xs font-semibold text-ok hover:underline"
                    >
                      Activeren
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const r = window.prompt("Reden van afwijzing (ziet de aanvrager)");
                        if (r) void call("/api/admin/bank/insurance", "POST", { action: "reject", id: p.id, note: r }, "Afgewezen.");
                      }}
                      className="text-xs text-neutralx-500 hover:text-crit hover:underline"
                    >
                      Afwijzen
                    </button>
                  </>
                )}
                {p.status === "active" && (
                  <button type="button" onClick={() => window.confirm("Polis beëindigen?") && call("/api/admin/bank/insurance", "POST", { action: "cancel", id: p.id }, "Beëindigd.")} className="text-xs text-neutralx-500 hover:text-crit hover:underline">
                    Beëindigen
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card space-y-4 p-5">
        <div>
          <p className="text-sm font-semibold text-ink">Verzekeringen in de bank</p>
          <p className="text-xs text-neutralx-500">Een product gaat pas aan met een echte verzekeraar ingevuld (die draagt het risico). Bemiddelen in verzekeringen vraagt een AFM-vergunning of een volmacht/aanbiederschap via de verzekeraar.</p>
        </div>
        {products.map((p, i) => (
          <div key={p.id} className="grid gap-2 rounded-xl border border-hair p-3 sm:grid-cols-6">
            <input value={p.name} onChange={(e) => upd(i, { name: e.target.value })} className={`${inp} sm:col-span-2`} />
            <input value={p.insurer} onChange={(e) => upd(i, { insurer: e.target.value })} placeholder="Verzekeraar (verplicht om aan te zetten)" className={`${inp} sm:col-span-2`} />
            <label className="flex items-center gap-1 text-sm">
              €
              <input
                inputMode="decimal"
                defaultValue={(p.monthlyPremiumCents / 100).toFixed(2).replace(".", ",")}
                onBlur={(e) => upd(i, { monthlyPremiumCents: Math.round(Number(e.target.value.replace(",", ".")) * 100) || 0 })}
                className={inp}
              />
              /mnd
            </label>
            <select value={p.audience} onChange={(e) => upd(i, { audience: e.target.value as Product["audience"] })} className={inp}>
              {Object.entries(AUD).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <input value={p.description} onChange={(e) => upd(i, { description: e.target.value })} placeholder="Omschrijving" className={`${inp} sm:col-span-3`} />
            <input value={p.coverage} onChange={(e) => upd(i, { coverage: e.target.value })} placeholder="Dekking" className={`${inp} sm:col-span-2`} />
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={p.active} onChange={(e) => upd(i, { active: e.target.checked })} />
              Aan
            </label>
          </div>
        ))}
        <button type="button" onClick={() => call("/api/admin/bank/insurance", "PUT", { products }, "Verzekeringen opgeslagen.")} className="btn-primary text-sm">
          Verzekeringen opslaan
        </button>
      </div>

      <div className="card space-y-3 p-5">
        <div>
          <p className="text-sm font-semibold text-ink">Sparen — looptijden en rente</p>
          <p className="text-xs text-neutralx-500">Geldt voor nieuwe deposito&apos;s; lopende houden hun rente. De rente wordt op de einddatum vanaf de platformrekening betaald.</p>
        </div>
        <div className="space-y-2">
          {rates.map((r, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <input value={r.years} onChange={(e) => setRates(rates.map((x, n) => (n === i ? { ...x, years: e.target.value } : x)))} className={`${inp} w-16`} />
              jaar
              <input value={r.pct} onChange={(e) => setRates(rates.map((x, n) => (n === i ? { ...x, pct: e.target.value } : x)))} className={`${inp} w-20`} />% per jaar
              <button type="button" onClick={() => setRates(rates.filter((_, n) => n !== i))} className="text-xs text-neutralx-500 hover:text-crit">
                verwijder
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setRates([...rates, { years: "", pct: "" }])} className="rounded-lg border border-hairstrong px-3 py-1.5 text-xs font-semibold">
            + Looptijd
          </button>
          <button
            type="button"
            onClick={() =>
              call(
                "/api/admin/bank/rates",
                "PUT",
                { rates: Object.fromEntries(rates.filter((r) => r.years).map((r) => [String(Number(r.years)), Math.round(Number(r.pct.replace(",", ".")) * 100) || 0])) },
                "Spaarrentes opgeslagen.",
              )
            }
            className="btn-primary text-sm"
          >
            Rentes opslaan
          </button>
        </div>
      </div>
    </div>
  );
}
