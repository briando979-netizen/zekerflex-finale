"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminBankExtras } from "@/components/bank/AdminBankExtras";

interface Fees {
  monthlyPersonalCents: number;
  monthlyOrganisationCents: number;
  cardVirtualCents: number;
  cardPhysicalCents: number;
  negativeBalanceFeeCents: number;
}
interface Withdrawal {
  id: string;
  holderName: string;
  amountCents: number;
  iban: string;
  status: string;
  requestedAt: string;
}
interface AccountRow {
  id: string;
  ownerType: "USER" | "TENANT" | "PLATFORM";
  number: string;
  holderName: string;
  balanceCents: number;
  frozen: boolean;
  frozenReason: string | null;
  payoutIban: string | null;
}
interface Payload {
  platform: { number: string; balanceCents: number };
  totals: { personalCents: number; personalCount: number; organisationCents: number; organisationCount: number; customerCents: number; potsCents: number; pendingWithdrawalCents: number };
  stripe: { availableCents: number; pendingCents: number } | null;
  sepaConfigured: boolean;
  fees: Fees;
  withdrawals: Withdrawal[];
  accounts: AccountRow[];
}

const euro = (c: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(c / 100);
const TYPE: Record<AccountRow["ownerType"], string> = { USER: "Persoonlijk", TENANT: "Bedrijf", PLATFORM: "Platform" };

export function AdminBankView() {
  const [data, setData] = useState<Payload | null>(null);
  const [fees, setFees] = useState<Record<keyof Fees, string> | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/bank", { cache: "no-store" });
    if (!res.ok) return;
    const d: Payload = await res.json();
    setData(d);
    setFees(Object.fromEntries(Object.entries(d.fees).map(([k, v]) => [k, (v / 100).toFixed(2).replace(".", ",")])) as Record<keyof Fees, string>);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function call(url: string, method: string, body: unknown, ok: string) {
    setNote(null);
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    if (!res?.ok) {
      const d = res ? await res.json().catch(() => ({})) : {};
      setNote({ ok: false, text: d?.error?.message ?? "Mislukt." });
      return;
    }
    setNote({ ok: true, text: ok });
    await load();
  }

  async function exportBatch() {
    setNote(null);
    const res = await fetch("/api/admin/bank/withdrawals");
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setNote({ ok: false, text: d?.error?.message ?? "Exporteren mislukt." });
      return;
    }
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `zekerflex-bank-opnames-${new Date().toISOString().slice(0, 10)}.xml`;
    a.click();
    const skipped = decodeURIComponent(res.headers.get("X-Skipped") ?? "");
    setNote({ ok: true, text: `SEPA-batch gedownload — upload hem bij de zakelijke bank en zet de opnames daarna op 'uitbetaald'.${skipped ? ` Overgeslagen: ${skipped}` : ""}` });
    await load();
  }

  if (!data || !fees) return <p className="py-16 text-center text-sm text-neutralx-400">Laden…</p>;
  const covered = data.stripe ? data.stripe.availableCents + data.stripe.pendingCents >= data.totals.customerCents : null;
  const q = query.trim().toLowerCase();
  const rows = data.accounts.filter((a) => !q || a.holderName.toLowerCase().includes(q) || a.number.toLowerCase().replace(/\s/g, "").includes(q.replace(/\s/g, "")));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">ZekerFlex Bank</h1>
        <p className="mt-1 text-sm text-neutralx-600">Alle rekeningen, wat het platform aan klanten verschuldigd is, kosten en uitbetalingen.</p>
      </div>
      {note && <p className={`rounded-xl px-4 py-3 text-sm ${note.ok ? "bg-ok/10 text-ok" : "bg-crit/10 text-crit"}`}>{note.text}</p>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Platformrekening (omzet uit kosten/facturen)" value={euro(data.platform.balanceCents)} sub={data.platform.number} />
        <Kpi label="Tegoed van klanten" value={euro(data.totals.customerCents)} sub={`${data.totals.personalCount} persoonlijk · ${data.totals.organisationCount} bedrijf · ${euro(data.totals.potsCents)} in potjes/deposito's`} />
        <Kpi label="Stripe-saldo (beschikbaar + onderweg)" value={data.stripe ? euro(data.stripe.availableCents + data.stripe.pendingCents) : "—"} sub={data.stripe ? `beschikbaar ${euro(data.stripe.availableCents)}` : "niet opgehaald"} />
        <Kpi label="Opnames te betalen" value={euro(data.totals.pendingWithdrawalCents)} sub={`${data.withdrawals.length} opname(s)`} />
      </div>
      {covered === false && (
        <p className="rounded-xl border border-crit/30 bg-crit/5 px-4 py-3 text-sm text-ink">
          <span className="font-semibold text-crit">Let op:</span> het Stripe-saldo is lager dan het totale tegoed van klanten. Vul het platformsaldo aan of houd uitbetalingen tegen tot dit klopt.
        </p>
      )}

      <div className="card space-y-3 p-5">
        <p className="text-sm font-semibold text-ink">Kosten</p>
        <div className="grid gap-3 sm:grid-cols-5">
          {(
            [
              ["monthlyPersonalCents", "Persoonlijk / maand"],
              ["monthlyOrganisationCents", "Bedrijf / maand"],
              ["cardVirtualCents", "Virtuele pas (eenmalig)"],
              ["cardPhysicalCents", "Fysieke pas (eenmalig)"],
              ["negativeBalanceFeeCents", "Rood staan (per week)"],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="text-xs font-semibold text-neutralx-600">
              {label}
              <span className="mt-1 flex items-center gap-1">
                €
                <input inputMode="decimal" value={fees[k]} onChange={(e) => setFees({ ...fees, [k]: e.target.value })} className="w-full rounded-lg border border-hairstrong bg-white px-2 py-1.5 text-sm" />
              </span>
            </label>
          ))}
        </div>
        <button
          type="button"
          onClick={() =>
            call(
              "/api/admin/bank/fees",
              "PUT",
              Object.fromEntries(Object.entries(fees).map(([k, v]) => [k, Math.round(Number(v.replace(",", ".")) * 100) || 0])),
              "Kosten opgeslagen.",
            )
          }
          className="btn-primary text-sm"
        >
          Kosten opslaan
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-hair px-5 py-3">
          <span className="text-sm font-semibold">Opnames</span>
          <button type="button" onClick={exportBatch} disabled={!data.sepaConfigured || !data.withdrawals.some((w) => w.status === "pending")} className="ml-auto rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">
            SEPA-batch downloaden
          </button>
        </div>
        {!data.sepaConfigured && <p className="px-5 py-3 text-xs text-warn">SEPA_CREDITOR_IBAN/NAME (de zakelijke rekening van ZekerFlex) zijn nog niet ingesteld.</p>}
        {data.withdrawals.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-neutralx-400">Geen opnames die op uitbetaling wachten.</p>
        ) : (
          <ul className="divide-y divide-hair text-sm">
            {data.withdrawals.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-ink">{w.holderName}</span>
                  <span className="block text-xs text-neutralx-500">
                    {w.iban} · {new Date(w.requestedAt).toLocaleString("nl-NL")} · {w.status === "pending" ? "klaar voor export" : "in batch geëxporteerd"}
                  </span>
                </span>
                <span className="num font-semibold">{euro(w.amountCents)}</span>
                <button type="button" onClick={() => call("/api/admin/bank/withdrawals", "POST", { id: w.id, action: "paid" }, "Op uitbetaald gezet.")} className="text-xs font-semibold text-ok hover:underline">
                  Uitbetaald
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const reason = window.prompt("Reden van terugboeken?");
                    if (reason) void call("/api/admin/bank/withdrawals", "POST", { id: w.id, action: "reverse", reason }, "Teruggeboekt.");
                  }}
                  className="text-xs text-neutralx-500 hover:text-crit hover:underline"
                >
                  Terugboeken
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-hair px-5 py-3">
          <span className="text-sm font-semibold">Rekeningen ({data.accounts.length})</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Zoek naam of rekeningnummer…" className="ml-auto w-56 rounded-lg border border-hairstrong bg-white px-2.5 py-1 text-xs" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-hair text-left text-xs uppercase tracking-wide text-neutralx-500">
                <th className="px-5 py-2.5 font-medium">Houder</th>
                <th className="px-5 py-2.5 font-medium">Soort</th>
                <th className="px-5 py-2.5 font-medium">Rekening</th>
                <th className="px-5 py-2.5 text-right font-medium">Saldo</th>
                <th className="px-5 py-2.5 text-right font-medium">Acties</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hair">
              {rows.map((a) => (
                <tr key={a.id}>
                  <td className="px-5 py-3">
                    <span className="font-medium text-ink">{a.holderName}</span>
                    {a.frozen && <span className="ml-2 rounded-full bg-crit/10 px-2 py-0.5 text-[11px] font-semibold text-crit">geblokkeerd</span>}
                  </td>
                  <td className="px-5 py-3 text-neutralx-600">{TYPE[a.ownerType]}</td>
                  <td className="px-5 py-3 font-mono text-xs text-neutralx-600">{a.number}</td>
                  <td className="num px-5 py-3 text-right font-semibold">{euro(a.balanceCents)}</td>
                  <td className="whitespace-nowrap px-5 py-3 text-right text-xs">
                    {a.ownerType !== "PLATFORM" && (
                      <button
                        type="button"
                        onClick={() => {
                          if (a.frozen) void call(`/api/admin/bank/accounts/${a.id}`, "POST", { action: "unfreeze" }, "Rekening gedeblokkeerd.");
                          else {
                            const reason = window.prompt(`Waarom ${a.holderName} blokkeren?`);
                            if (reason) void call(`/api/admin/bank/accounts/${a.id}`, "POST", { action: "freeze", reason }, "Rekening geblokkeerd.");
                          }
                        }}
                        className={`mr-3 font-semibold hover:underline ${a.frozen ? "text-ok" : "text-crit"}`}
                      >
                        {a.frozen ? "Deblokkeren" : "Blokkeren"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        const amount = window.prompt("Correctiebedrag in euro (negatief = afschrijven), bv. 12,50 of -5");
                        if (!amount) return;
                        const reason = window.prompt("Reden (komt op het afschrift en in het auditspoor)");
                        const cents = Math.round(Number(amount.replace(",", ".")) * 100);
                        if (reason && cents) void call(`/api/admin/bank/accounts/${a.id}`, "POST", { action: "adjust", amountCents: cents, reason }, "Correctie geboekt.");
                      }}
                      className="font-semibold text-brand-600 hover:underline"
                    >
                      Correctie
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <AdminBankExtras />
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="card p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-neutralx-500">{label}</p>
      <p className="num mt-2 font-display text-2xl font-bold text-ink">{value}</p>
      <p className="mt-1 text-xs text-neutralx-400">{sub}</p>
    </div>
  );
}
