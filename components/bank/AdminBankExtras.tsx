"use client";

import { useCallback, useEffect, useState } from "react";
import { dateNl, euro, euroExact } from "@/lib/admin/format";
import { Empty, Notice, Panel, Pill, type Tone } from "@/components/admin/kit";
import { DataTable, InlineAsk, type TableRow } from "@/components/admin/kit-client";

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

const AUD: Record<Product["audience"], string> = { personal: "Freelancers", organisation: "Bedrijven", all: "Iedereen" };
const POLICY_STATUS: Record<Policy["status"], { label: string; tone: Tone }> = {
  requested: { label: "Aangevraagd", tone: "warn" },
  active: { label: "Actief", tone: "ok" },
  rejected: { label: "Afgewezen", tone: "neutral" },
  cancelled: { label: "Beëindigd", tone: "neutral" },
};

/** /admin/bank: insurance catalogue + policy requests, and savings rates. */
export function AdminBankExtras() {
  const [products, setProducts] = useState<Product[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [rates, setRates] = useState<{ years: string; pct: string }[]>([]);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [openProduct, setOpenProduct] = useState<string | null>(null);

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
  const requests = policies.filter((p) => p.status === "requested");
  const active = policies.filter((p) => p.status === "active");

  const policyRows: TableRow[] = policies.slice(0, 100).map((p) => {
    const status = POLICY_STATUS[p.status];
    return {
      id: p.id,
      search: `${p.holderName} ${p.productName} ${p.insurer} ${p.policyNumber ?? ""}`,
      filters: { status: p.status },
      cells: {
        holder: <span className="font-medium" style={{ color: "var(--a-text)" }}>{p.holderName}</span>,
        product: <span>{p.productName}<span className="block text-xs" style={{ color: "var(--a-mute)" }}>{p.insurer}{p.policyNumber ? `, polis ${p.policyNumber}` : ""}</span></span>,
        premium: `${euro(p.premiumCents)} /mnd`,
        date: dateNl(p.requestedAt),
        status: (
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <Pill tone={status.tone}>{status.label}</Pill>
            {p.arrears && <Pill tone="crit">Achterstand</Pill>}
          </span>
        ),
        actions: (
          <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
            {p.status === "requested" && (
              <>
                <InlineAsk label="Activeren" question={`Polisnummer van ${p.insurer}? De eerste premie wordt direct geïnd.`} placeholder="Polisnummer" required submitLabel="Activeren" onSubmit={(policyNumber) => call("/api/admin/bank/insurance", "POST", { action: "activate", id: p.id, policyNumber }, "Polis actief.")} />
                <InlineAsk label="Afwijzen" question="Reden van afwijzing (ziet de aanvrager)" placeholder="Reden" required submitLabel="Afwijzen" onSubmit={(reason) => call("/api/admin/bank/insurance", "POST", { action: "reject", id: p.id, note: reason }, "Afgewezen.")} />
              </>
            )}
            {p.status === "active" && (
              <button type="button" className="a-button text-xs" onClick={() => { if (window.confirm("Polis beëindigen?")) void call("/api/admin/bank/insurance", "POST", { action: "cancel", id: p.id }, "Beëindigd."); }}>Beëindigen</button>
            )}
          </span>
        ),
      },
      sort: { holder: p.holderName, product: p.productName, premium: p.premiumCents, date: new Date(p.requestedAt).getTime(), status: status.label },
    };
  });

  return (
    <div className="space-y-4">
      {note && <Notice tone={note.ok ? "ok" : "crit"}>{note.text}</Notice>}

      <Panel flush title="Verzekeringsaanvragen" subtitle={`${requests.length} te behandelen, ${active.length} actieve polissen, ${euroExact(active.reduce((s, p) => s + p.premiumCents, 0))} per maand aan premie`}>
        <DataTable
          columns={[
            { key: "holder", label: "Aanvrager" },
            { key: "product", label: "Product", hideOnMobile: true },
            { key: "premium", label: "Premie", align: "right", hideOnMobile: true },
            { key: "date", label: "Datum", hideOnMobile: true },
            { key: "status", label: "Status" },
            { key: "actions", label: "", align: "right", sortable: false },
          ]}
          rows={policyRows}
          pageSize={10}
          searchPlaceholder="Zoek op naam, product of polis"
          filters={[{ key: "status", label: "Status", chips: true, options: (Object.keys(POLICY_STATUS) as Policy["status"][]).map((value) => ({ value, label: POLICY_STATUS[value].label })) }]}
          defaultSort={{ key: "date", dir: "desc" }}
          emptyText="Nog geen aanvragen."
        />
      </Panel>

      <div className="grid items-start gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Panel
          flush
          title="Verzekeringen in de bank"
          subtitle="Een product gaat pas aan met een echte verzekeraar ingevuld, die het risico draagt. Bemiddelen in verzekeringen vraagt een AFM-vergunning of een volmacht via de verzekeraar."
          footer={<button type="button" onClick={() => void call("/api/admin/bank/insurance", "PUT", { products }, "Verzekeringen opgeslagen.")} className="a-button a-button-primary">Verzekeringen opslaan</button>}
        >
          {products.length === 0 ? (
            <Empty title="Nog geen producten" />
          ) : (
            <ul>
              {products.map((p, i) => {
                const open = openProduct === p.id;
                return (
                  <li key={p.id} style={{ borderTop: "1px solid var(--a-border)" }}>
                    <button type="button" onClick={() => setOpenProduct(open ? null : p.id)} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[0.8125rem] transition-colors hover:bg-[var(--a-panel-2)] sm:px-5">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium" style={{ color: "var(--a-text)" }}>{p.name}</span>
                        <span className="block truncate text-xs" style={{ color: "var(--a-mute)" }}>{p.insurer || "Nog geen verzekeraar"}, {AUD[p.audience]}</span>
                      </span>
                      <span className="num flex-shrink-0 text-xs" style={{ color: "var(--a-dim)" }}>{euro(p.monthlyPremiumCents)} /mnd</span>
                      <Pill tone={p.active ? "ok" : "neutral"}>{p.active ? "Aan" : "Uit"}</Pill>
                    </button>
                    {open && (
                      <div className="grid gap-3 px-4 pb-4 sm:grid-cols-2 sm:px-5">
                        <label className="a-label">Naam<input value={p.name} onChange={(e) => upd(i, { name: e.target.value })} className="a-input" /></label>
                        <label className="a-label">Verzekeraar<input value={p.insurer} onChange={(e) => upd(i, { insurer: e.target.value })} placeholder="Verplicht om aan te zetten" className="a-input" /></label>
                        <label className="a-label">
                          Premie per maand (€)
                          <input inputMode="decimal" defaultValue={(p.monthlyPremiumCents / 100).toFixed(2).replace(".", ",")} onBlur={(e) => upd(i, { monthlyPremiumCents: Math.round(Number(e.target.value.replace(",", ".")) * 100) || 0 })} className="a-input" />
                        </label>
                        <label className="a-label">
                          Voor wie
                          <select value={p.audience} onChange={(e) => upd(i, { audience: e.target.value as Product["audience"] })} className="a-input">
                            {Object.entries(AUD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                          </select>
                        </label>
                        <label className="a-label sm:col-span-2">Omschrijving<input value={p.description} onChange={(e) => upd(i, { description: e.target.value })} className="a-input" /></label>
                        <label className="a-label sm:col-span-2">Dekking<input value={p.coverage} onChange={(e) => upd(i, { coverage: e.target.value })} className="a-input" /></label>
                        <label className="flex items-center gap-2 text-[0.8125rem] font-medium" style={{ color: "var(--a-text)" }}>
                          <input type="checkbox" checked={p.active} onChange={(e) => upd(i, { active: e.target.checked })} /> Product staat aan
                        </label>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel
          title="Sparen"
          subtitle="Looptijden en rente. Geldt voor nieuwe deposito's; lopende houden hun rente. De rente wordt op de einddatum vanaf de platformrekening betaald."
          footer={
            <span className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setRates([...rates, { years: "", pct: "" }])} className="a-button">Looptijd toevoegen</button>
              <button
                type="button"
                onClick={() => void call("/api/admin/bank/rates", "PUT", { rates: Object.fromEntries(rates.filter((r) => r.years).map((r) => [String(Number(r.years)), Math.round(Number(r.pct.replace(",", ".")) * 100) || 0])) }, "Spaarrentes opgeslagen.")}
                className="a-button a-button-primary"
              >
                Rentes opslaan
              </button>
            </span>
          }
        >
          <ul className="space-y-2">
            {rates.map((r, i) => (
              <li key={i} className="flex items-center gap-2 text-[0.8125rem]" style={{ color: "var(--a-dim)" }}>
                <input value={r.years} aria-label="Looptijd in jaren" onChange={(e) => setRates(rates.map((x, n) => (n === i ? { ...x, years: e.target.value } : x)))} className="a-input !w-16 text-center" />
                jaar
                <input value={r.pct} aria-label="Rente per jaar in procenten" onChange={(e) => setRates(rates.map((x, n) => (n === i ? { ...x, pct: e.target.value } : x)))} className="a-input !w-20 text-center" />
                % per jaar
                <button type="button" onClick={() => setRates(rates.filter((_, n) => n !== i))} className="ml-auto text-xs hover:underline" style={{ color: "var(--a-mute)" }}>Verwijderen</button>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
