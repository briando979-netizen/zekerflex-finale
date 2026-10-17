"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BankCards, type CardRow } from "@/components/bank/BankCards";
import { BankPots, type Pot } from "@/components/bank/BankPots";
import { BankForecast, BankInsights, type InsightsPayload } from "@/components/bank/BankInsights";
import { BankInsurance, type InsuranceProduct, type Policy } from "@/components/bank/BankInsurance";

interface Account {
  id: string;
  number: string;
  holderName: string;
  balanceCents: number;
  payoutIban: string | null;
  payoutName: string | null;
  frozen: boolean;
  frozenReason: string | null;
  nextFeeAt: string | null;
}
interface Entry {
  id: string;
  amountCents: number;
  balanceAfterCents: number;
  kind: string;
  description: string;
  counterparty: string | null;
  createdAt: string;
}
interface Withdrawal {
  id: string;
  amountCents: number;
  iban: string;
  status: "pending" | "exported" | "paid" | "reversed";
  requestedAt: string;
  reason?: string;
}
interface Invoice {
  id: string;
  number: string;
  totalCents: number;
  createdAt: string;
}
interface Payload {
  account: Account;
  role: "platform" | "organisation" | "personal";
  canMoveMoney: boolean;
  fees: { monthlyCents: number; cardVirtualCents: number; cardPhysicalCents: number; negativeBalanceCents: number };
  entries: Entry[];
  cards: CardRow[];
  stripePublishableKey: string | null;
  payoutDestination: "iban" | "bank" | null;
}

type Tab = "overzicht" | "potjes" | "inzicht" | "passen" | "verzekeren" | "instellingen";
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "overzicht", label: "Overzicht", icon: "🏦" },
  { id: "potjes", label: "Potjes & sparen", icon: "🐷" },
  { id: "inzicht", label: "Inzicht", icon: "📊" },
  { id: "passen", label: "Passen", icon: "💳" },
  { id: "verzekeren", label: "Verzekeren", icon: "🛡️" },
  { id: "instellingen", label: "Instellingen", icon: "⚙️" },
];

const euro = (c: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(c / 100);
const dayLabel = (d: string) => {
  const date = new Date(d);
  const today = new Date();
  const y = new Date(today.getTime() - 86_400_000);
  if (date.toDateString() === today.toDateString()) return "Vandaag";
  if (date.toDateString() === y.toDateString()) return "Gisteren";
  return date.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" });
};
const time = (d: string) => new Date(d).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
const KIND: Record<string, { label: string; icon: string }> = {
  TOPUP: { label: "Opwaardering", icon: "＋" },
  WITHDRAWAL: { label: "Opname", icon: "↗" },
  WITHDRAWAL_REVERSAL: { label: "Terugboeking", icon: "↩" },
  FEE_MONTHLY: { label: "Bankkosten", icon: "🏦" },
  FEE_CARD: { label: "Paskosten", icon: "💳" },
  CARD_SPEND: { label: "Pasbetaling", icon: "💳" },
  CARD_REFUND: { label: "Terugbetaling", icon: "↩" },
  INVOICE_PAYMENT: { label: "Factuur", icon: "🧾" },
  EARNING: { label: "Verdiensten", icon: "💼" },
  TRANSFER: { label: "Overboeking", icon: "⇄" },
  ADJUSTMENT: { label: "Correctie", icon: "✎" },
  POT_IN: { label: "Naar potje", icon: "🐷" },
  POT_OUT: { label: "Uit potje", icon: "🐷" },
  INTEREST: { label: "Rente", icon: "📈" },
  INSURANCE_PREMIUM: { label: "Verzekering", icon: "🛡️" },
};
const W_STATUS: Record<Withdrawal["status"], string> = {
  pending: "aangevraagd",
  exported: "onderweg naar je bank",
  paid: "uitbetaald",
  reversed: "teruggeboekt",
};

async function errorText(res: Response, fallback: string) {
  const d = await res.json().catch(() => ({}));
  return d?.error?.message ?? fallback;
}

export function BankView({ returnPath }: { returnPath: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [pots, setPots] = useState<Pot[]>([]);
  const [rates, setRates] = useState<Record<string, number>>({});
  const [insights, setInsights] = useState<InsightsPayload | null>(null);
  const [insurance, setInsurance] = useState<{ products: InsuranceProduct[]; policies: Policy[] }>({ products: [], policies: [] });
  const [tab, setTab] = useState<Tab>("overzicht");
  const [panel, setPanel] = useState<null | "topup" | "withdraw">(null);
  const [filter, setFilter] = useState<"all" | "in" | "out">("all");
  const [search, setSearch] = useState("");
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState("50");
  const [iban, setIban] = useState("");
  const [ibanName, setIbanName] = useState("");
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [hidden, setHidden] = useState(false);

  const load = useCallback(async () => {
    const get = (u: string) => fetch(u, { cache: "no-store" }).catch(() => null);
    const [b, w, i, p, ins, insr] = await Promise.all([
      get("/api/me/bank?take=200"),
      get("/api/me/bank/withdraw"),
      get("/api/me/bank/pay-invoice"),
      get("/api/me/bank/pots"),
      get("/api/me/bank/insights"),
      get("/api/me/bank/insurance"),
    ]);
    if (b?.ok) {
      const d: Payload = await b.json();
      setData(d);
      setIban(d.account.payoutIban ?? "");
      setIbanName(d.account.payoutName ?? d.account.holderName);
    }
    if (w?.ok) setWithdrawals((await w.json()).withdrawals);
    if (i?.ok) setInvoices((await i.json()).invoices);
    if (p?.ok) {
      const d = await p.json();
      setPots(d.pots);
      setRates(d.rates);
    }
    if (ins?.ok) setInsights(await ins.json());
    if (insr?.ok) setInsurance(await insr.json());
  }, []);

  useEffect(() => {
    try {
      const t = localStorage.getItem("zf-bank-tab") as Tab | null;
      if (t && TABS.some((x) => x.id === t)) setTab(t);
      setHidden(localStorage.getItem("zf-bank-hide") === "1");
    } catch {
      /* storage unavailable — defaults are fine */
    }
    void load();
    if (new URLSearchParams(window.location.search).get("opgewaardeerd")) {
      setNote({ ok: true, text: "Betaling ontvangen — je saldo wordt binnen een paar seconden bijgewerkt." });
      const t = setTimeout(() => void load(), 4000);
      return () => clearTimeout(t);
    }
  }, [load]);

  function go(t: Tab) {
    setTab(t);
    setNote(null);
    try {
      localStorage.setItem("zf-bank-tab", t);
    } catch {
      /* ignore */
    }
  }

  const changed = async (n: { ok: boolean; text: string }) => {
    setNote(n);
    await load();
  };

  const cents = Math.round(Number(amount.replace(",", ".")) * 100);

  async function run(fn: () => Promise<Response>, ok: string, fallback: string) {
    setBusy(true);
    setNote(null);
    try {
      const res = await fn();
      if (!res.ok) return setNote({ ok: false, text: await errorText(res, fallback) });
      setNote({ ok: true, text: ok });
      setPanel(null);
      await load();
    } catch {
      setNote({ ok: false, text: fallback });
    } finally {
      setBusy(false);
    }
  }

  const json = (url: string, method: string, body: unknown) =>
    fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  async function topup() {
    setBusy(true);
    setNote(null);
    const res = await json("/api/me/bank/topup", "POST", { amountCents: cents, returnPath }).catch(() => null);
    if (res?.ok) {
      window.location.href = (await res.json()).url;
      return;
    }
    setNote({ ok: false, text: res ? await errorText(res, "Opwaarderen lukte niet.") : "Geen verbinding." });
    setBusy(false);
  }

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.entries ?? []).filter(
      (e) =>
        (filter === "all" || (filter === "in" ? e.amountCents > 0 : e.amountCents < 0)) &&
        (!q || e.description.toLowerCase().includes(q) || (e.counterparty ?? "").toLowerCase().includes(q)),
    );
  }, [data, filter, search]);

  const grouped = useMemo(() => {
    const out: { day: string; items: Entry[] }[] = [];
    for (const e of shown) {
      const day = dayLabel(e.createdAt);
      if (out.at(-1)?.day !== day) out.push({ day, items: [] });
      out.at(-1)!.items.push(e);
    }
    return out;
  }, [shown]);

  if (!data) return <p className="py-16 text-center text-sm text-neutralx-400">Rekening laden…</p>;
  const { account, canMoveMoney, fees, role } = data;
  const field = "w-full rounded-lg border border-hairstrong bg-white px-3 py-2 text-sm";
  const potsTotal = pots.reduce((s, p) => s + p.balanceCents, 0);
  const reserved = insights?.forecast.reservedCents ?? 0;
  const money = (c: number) => (hidden ? "€ ••••" : euro(c));
  const canAct = canMoveMoney && role !== "platform" && !account.frozen;
  // Still in the free first month: no monthly fee has been charged yet.
  const freeUntil =
    role !== "platform" && account.nextFeeAt && !data.entries.some((e) => e.kind === "FEE_MONTHLY") && new Date(account.nextFeeAt).getTime() - Date.now() <= 31 * 86_400_000
      ? new Date(account.nextFeeAt).toLocaleDateString("nl-NL", { day: "numeric", month: "long" })
      : null;
  const tabs = TABS.filter((t) => role !== "platform" || t.id === "overzicht" || t.id === "inzicht");

  const bookings = (limit?: number) => (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-hair px-5 py-3">
        <span className="text-sm font-semibold">{limit ? "Laatste boekingen" : "Alle boekingen"}</span>
        {!limit && (
          <>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Zoeken…" className="ml-auto w-36 rounded-lg border border-hairstrong bg-white px-2.5 py-1 text-xs sm:w-48" />
            <div className="flex gap-1">
              {(["all", "in", "out"] as const).map((f) => (
                <button key={f} type="button" onClick={() => setFilter(f)} className={`rounded-full px-2.5 py-1 text-xs ${filter === f ? "bg-ink text-white" : "bg-paper-soft text-neutralx-600"}`}>
                  {f === "all" ? "alles" : f === "in" ? "bij" : "af"}
                </button>
              ))}
            </div>
          </>
        )}
        {limit && (
          <button type="button" onClick={() => go("instellingen")} className="ml-auto text-xs font-semibold text-brand-600 hover:underline">
            Alles &amp; afschriften →
          </button>
        )}
      </div>
      {shown.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-neutralx-400">Nog geen boekingen.</p>
      ) : (
        <div>
          {(limit ? [{ day: "", items: shown.slice(0, limit) }] : grouped).map((g) => (
            <div key={g.day || "recent"}>
              {g.day && <p className="bg-paper-soft/60 px-5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutralx-500">{g.day}</p>}
              <ul className="divide-y divide-hair">
                {g.items.map((e) => {
                  const k = KIND[e.kind] ?? { label: e.kind, icon: "•" };
                  return (
                    <li key={e.id} className="flex items-center gap-3 px-5 py-3">
                      <span className={`grid h-10 w-10 flex-shrink-0 place-items-center rounded-full text-base ${e.amountCents > 0 ? "bg-ok/10 text-ok" : "bg-paper-soft text-neutralx-600"}`} aria-hidden>
                        {k.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">{e.counterparty && e.kind === "CARD_SPEND" ? e.counterparty : e.description}</span>
                        <span className="block truncate text-xs text-neutralx-500">
                          {k.label} · {limit ? `${dayLabel(e.createdAt)} ` : ""}
                          {time(e.createdAt)}
                        </span>
                      </span>
                      <span className={`num text-sm font-semibold ${e.amountCents > 0 ? "text-ok" : "text-ink"}`}>
                        {e.amountCents > 0 ? "+" : "−"}
                        {hidden ? "••••" : euro(Math.abs(e.amountCents))}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0E5C4A] via-[#0A4B3C] to-[#062a22] p-6 text-white shadow-lift sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/5" />
        <div className="pointer-events-none absolute -bottom-20 right-24 h-40 w-40 rounded-full bg-brand-mint/10" />
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/60">ZekerFlex Bank</p>
            <p className="mt-1 truncate text-sm text-white/80">{account.holderName}</p>
          </div>
          <span className="rounded-full bg-white/10 px-3 py-1 font-mono text-[11px] tracking-wider">{account.number}</span>
        </div>
        <div className="relative mt-6 flex items-center gap-2">
          <p className="text-xs text-white/60">Beschikbaar saldo</p>
          <button
            type="button"
            aria-label={hidden ? "Saldo tonen" : "Saldo verbergen"}
            onClick={() => {
              setHidden(!hidden);
              try {
                localStorage.setItem("zf-bank-hide", hidden ? "0" : "1");
              } catch {
                /* ignore */
              }
            }}
            className="text-xs text-white/60 hover:text-white"
          >
            {hidden ? "👁 tonen" : "verbergen"}
          </button>
        </div>
        <p className="num relative font-display text-4xl font-bold sm:text-5xl">{money(account.balanceCents)}</p>
        <div className="relative mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-white/70">
          {potsTotal > 0 && <span>🐷 In potjes {money(potsTotal)}</span>}
          {reserved > 0 && <span>⏳ Gereserveerd {money(reserved)}</span>}
          {potsTotal > 0 && <span>Totaal vermogen {money(account.balanceCents + potsTotal)}</span>}
        </div>
        {canAct && (
          <div className="relative mt-6 grid grid-cols-4 gap-2 sm:flex sm:gap-3">
            {[
              { icon: "＋", label: "Opwaarderen", on: () => setPanel(panel === "topup" ? null : "topup") },
              { icon: "↗", label: "Opnemen", on: () => setPanel(panel === "withdraw" ? null : "withdraw") },
              { icon: "🐷", label: "Potjes", on: () => go("potjes") },
              { icon: "💳", label: "Passen", on: () => go("passen") },
            ].map((a) => (
              <button key={a.label} type="button" onClick={a.on} className="flex flex-col items-center gap-1.5 sm:flex-row sm:rounded-full sm:bg-white/10 sm:px-4 sm:py-2 sm:hover:bg-white/20">
                <span className="grid h-11 w-11 place-items-center rounded-full bg-white/15 text-lg sm:h-auto sm:w-auto sm:bg-transparent sm:text-base">{a.icon}</span>
                <span className="text-[11px] font-semibold sm:text-sm">{a.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {account.frozen && (
        <p className="rounded-xl border border-crit/30 bg-crit/5 px-4 py-3 text-sm text-ink">
          Deze rekening is geblokkeerd{account.frozenReason ? `: ${account.frozenReason}` : ""}. Neem contact op met ZekerFlex Support.
        </p>
      )}
      {!canMoveMoney && role === "organisation" && (
        <p className="rounded-xl bg-paper-soft px-4 py-3 text-sm text-neutralx-600">Je kunt de bedrijfsrekening bekijken; alleen de hoofdbeheerder kan geld verplaatsen.</p>
      )}
      {note && <p className={`rounded-xl px-4 py-3 text-sm ${note.ok ? "bg-ok/10 text-ok" : "bg-crit/10 text-crit"}`}>{note.text}</p>}

      {account.balanceCents < 0 && role !== "platform" && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-crit/30 bg-crit/5 px-4 py-3 text-sm text-ink">
          <span className="min-w-0 flex-1">
            <strong className="text-crit">Je staat {euro(-account.balanceCents)} rood.</strong> Pasbetalingen worden geweigerd tot je saldo weer positief is. We vullen eerst aan uit je potjes; lukt dat niet, dan kost rood staan{" "}
            {fees.negativeBalanceCents ? euro(fees.negativeBalanceCents) : "extra"} per week.
          </span>
          {canAct || (canMoveMoney && account.frozen) ? (
            <button type="button" onClick={() => setPanel("topup")} className="rounded-full bg-crit px-4 py-2 text-sm font-semibold text-white">
              Nu aanvullen
            </button>
          ) : null}
        </div>
      )}

      {freeUntil && (
        <p className="flex items-center gap-2 rounded-xl border border-ok/30 bg-ok/5 px-4 py-3 text-sm text-ink">
          <span aria-hidden>🎉</span>
          <span>
            Je eerste 30 dagen zijn <strong>gratis</strong> — geen maandkosten tot {freeUntil}. De virtuele betaalpas is altijd gratis.
          </span>
        </p>
      )}

      {panel === "topup" && (
        <div className="card space-y-3 p-5">
          <p className="text-sm font-semibold text-ink">Opwaarderen met iDEAL, Apple Pay, Google Pay of kaart</p>
          <div className="flex flex-wrap gap-2">
            {["25", "50", "100", "250", "500"].map((v) => (
              <button key={v} type="button" onClick={() => setAmount(v)} className={`rounded-full border px-3 py-1.5 text-sm ${amount === v ? "border-brand-500 bg-brand-50 text-brand-700" : "border-hairstrong"}`}>
                € {v}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-neutralx-500">€</span>
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${field} max-w-[10rem]`} />
            <button type="button" onClick={topup} disabled={busy || !(cents >= 500 && cents <= 500000)} className="btn-primary text-sm disabled:opacity-50">
              {busy ? "Bezig…" : `${euro(Number.isFinite(cents) ? cents : 0)} opwaarderen`}
            </button>
          </div>
          <p className="text-xs text-neutralx-500">Van € 5 tot € 5.000 per keer. Het bedrag staat direct na de betaling op je rekening.</p>
        </div>
      )}

      {panel === "withdraw" && (
        <div className="card space-y-3 p-5">
          <p className="text-sm font-semibold text-ink">Opnemen naar {account.payoutIban ? `${account.payoutIban.slice(0, 4)} …${account.payoutIban.slice(-4)}` : "je eigen rekening"}</p>
          {!account.payoutIban ? (
            <p className="text-sm text-neutralx-600">
              Stel eerst je eigen IBAN in bij{" "}
              <button type="button" onClick={() => go("instellingen")} className="font-semibold text-brand-600 underline">
                Instellingen
              </button>
              .
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-neutralx-500">€</span>
              <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${field} max-w-[10rem]`} />
              <button
                type="button"
                disabled={busy || !(cents >= 100) || cents > account.balanceCents}
                onClick={() => run(() => json("/api/me/bank/withdraw", "POST", { amountCents: cents, requestKey: crypto.randomUUID() }), "Opname aangevraagd — het geld gaat met de eerstvolgende uitbetaling naar je bank.", "Opnemen lukte niet.")}
                className="btn-primary text-sm disabled:opacity-50"
              >
                {busy ? "Bezig…" : "Opnemen"}
              </button>
            </div>
          )}
          <p className="text-xs text-neutralx-500">Het bedrag wordt direct gereserveerd en via een SEPA-overboeking uitbetaald (meestal binnen 1–2 werkdagen).</p>
        </div>
      )}

      {/* Tabs */}
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex w-max gap-1 rounded-2xl bg-paper-soft p-1 sm:w-full">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => go(t.id)}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold transition sm:flex-1 sm:justify-center ${tab === t.id ? "bg-white text-ink shadow-sm" : "text-neutralx-500 hover:text-ink"}`}
            >
              <span aria-hidden>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "overzicht" && (
        <div className="space-y-5">
          {insights && <BankForecast data={insights.forecast} balanceCents={account.balanceCents} />}

          {invoices.length > 0 && (
            <div className="card overflow-hidden">
              <div className="border-b border-hair px-5 py-3 text-sm font-semibold">Openstaande facturen</div>
              <ul className="divide-y divide-hair text-sm">
                {invoices.map((inv) => (
                  <li key={inv.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <span>
                      <span className="font-mono text-xs text-neutralx-600">{inv.number}</span>
                      <span className="num ml-3 font-semibold text-ink">{euro(inv.totalCents)}</span>
                    </span>
                    {canMoveMoney && (
                      <button
                        type="button"
                        disabled={busy || inv.totalCents > account.balanceCents || account.frozen}
                        onClick={() => run(() => json("/api/me/bank/pay-invoice", "POST", { invoiceIds: [inv.id] }), `Factuur ${inv.number} betaald vanaf je ZekerFlex Bank.`, "Betalen lukte niet.")}
                        className="rounded-lg border border-hairstrong px-3 py-1.5 text-xs font-semibold hover:bg-paper-soft disabled:opacity-40"
                        title={inv.totalCents > account.balanceCents ? "Onvoldoende saldo" : undefined}
                      >
                        Betaal vanaf saldo
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {withdrawals.some((w) => w.status === "pending" || w.status === "exported") && (
            <div className="card overflow-hidden">
              <div className="border-b border-hair px-5 py-3 text-sm font-semibold">Opnames onderweg</div>
              <ul className="divide-y divide-hair text-sm">
                {withdrawals
                  .filter((w) => w.status === "pending" || w.status === "exported")
                  .map((w) => (
                    <li key={w.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                      <span className="text-neutralx-600">naar …{w.iban.slice(-4)}</span>
                      <span className="flex items-center gap-3">
                        <span className="text-xs text-warn">{W_STATUS[w.status]}</span>
                        <span className="num font-semibold">{euro(w.amountCents)}</span>
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          )}

          {bookings(8)}
        </div>
      )}

      {tab === "potjes" && <BankPots pots={pots} rates={rates} balanceCents={account.balanceCents} canManage={canAct} onChanged={changed} />}

      {tab === "inzicht" && (insights ? <BankInsights data={insights.insights} /> : <p className="py-10 text-center text-sm text-neutralx-400">Laden…</p>)}

      {tab === "passen" && (
        <BankCards
          cards={data.cards}
          fees={fees}
          canManage={canMoveMoney}
          frozen={account.frozen}
          balanceCents={account.balanceCents}
          holderName={account.holderName}
          publishableKey={data.stripePublishableKey}
          onChanged={changed}
        />
      )}

      {tab === "verzekeren" && <BankInsurance products={insurance.products} policies={insurance.policies} canManage={canAct} onChanged={changed} />}

      {tab === "instellingen" && (
        <div className="space-y-5">
          {canMoveMoney && role !== "platform" && (
            <div className="card space-y-3 p-5">
              <p className="text-sm font-semibold text-ink">Je eigen bankrekening (voor opnames)</p>
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                <input value={iban} onChange={(e) => setIban(e.target.value)} placeholder="NL00 BANK 0123 4567 89" className={field} />
                <input value={ibanName} onChange={(e) => setIbanName(e.target.value)} placeholder="Naam rekeninghouder" className={field} />
                <button type="button" disabled={busy} onClick={() => run(() => json("/api/me/bank/iban", "PUT", { iban, name: ibanName }), "IBAN opgeslagen.", "IBAN opslaan lukte niet.")} className="btn-primary text-sm disabled:opacity-50">
                  Opslaan
                </button>
              </div>
            </div>
          )}

          {data.payoutDestination && (
            <div className="card flex flex-wrap items-center gap-3 p-5">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink">Verdiensten op ZekerFlex Bank</span>
                <span className="block text-xs text-neutralx-500">
                  {data.payoutDestination === "bank"
                    ? "Goedgekeurde uren staan direct op deze rekening — geen wachttijd op een bankoverschrijving."
                    : "Nu gaan goedgekeurde uren naar je eigen IBAN. Zet dit aan om ze direct hier te ontvangen."}
                </span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={data.payoutDestination === "bank"}
                disabled={busy}
                onClick={() =>
                  run(
                    () => json("/api/me/bank/payout-destination", "PUT", { destination: data.payoutDestination === "bank" ? "iban" : "bank" }),
                    data.payoutDestination === "bank" ? "Verdiensten gaan weer naar je eigen IBAN." : "Verdiensten komen voortaan direct op je ZekerFlex Bank.",
                    "Wijzigen lukte niet.",
                  )
                }
                className={`relative h-7 w-12 flex-shrink-0 rounded-full transition ${data.payoutDestination === "bank" ? "bg-brand-500" : "bg-neutralx-300"}`}
              >
                <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${data.payoutDestination === "bank" ? "left-6" : "left-1"}`} />
              </button>
            </div>
          )}

          <div className="card flex flex-wrap items-center gap-2 p-5 text-sm">
            <span className="font-semibold text-ink">Afschrift</span>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-lg border border-hairstrong px-2 py-1 text-xs" />
            <a href={`/api/me/bank/statement?month=${month}`} className="text-xs font-semibold text-brand-600 hover:underline">
              Download (CSV)
            </a>
          </div>

          {withdrawals.length > 0 && (
            <div className="card overflow-hidden">
              <div className="border-b border-hair px-5 py-3 text-sm font-semibold">Alle opnames</div>
              <ul className="divide-y divide-hair text-sm">
                {withdrawals.slice(0, 20).map((w) => (
                  <li key={w.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                    <span className="text-neutralx-600">
                      {new Date(w.requestedAt).toLocaleDateString("nl-NL")} · naar …{w.iban.slice(-4)}
                    </span>
                    <span className="flex items-center gap-3">
                      <span className={`text-xs ${w.status === "paid" ? "text-ok" : w.status === "reversed" ? "text-crit" : "text-warn"}`}>{W_STATUS[w.status]}</span>
                      <span className="num font-semibold">{euro(w.amountCents)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {bookings()}

          <div className="card space-y-1 p-5 text-xs leading-relaxed text-neutralx-500">
            <p className="text-sm font-semibold text-ink">Kosten</p>
            {role !== "platform" && <p>Rekening: {euro(fees.monthlyCents)} per maand (eerste maand gratis){account.nextFeeAt ? `, volgende keer op ${new Date(account.nextFeeAt).toLocaleDateString("nl-NL")}` : ""}.</p>}
            <p>
              Betaalpas: virtueel {fees.cardVirtualCents === 0 ? "gratis" : `eenmalig ${euro(fees.cardVirtualCents)}`}, fysiek {fees.cardPhysicalCents === 0 ? "gratis" : `eenmalig ${euro(fees.cardPhysicalCents)}`}.
            </p>
            <p className="pt-2 text-neutralx-400">Het geld op ZekerFlex Bank-rekeningen staat op de rekening van ZekerFlex B.V. bij Stripe Payments Europe. Betalingen in en uit lopen via Stripe en SEPA.</p>
          </div>
        </div>
      )}
    </div>
  );
}
