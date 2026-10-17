"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BankCards, type CardRow } from "@/components/bank/BankCards";

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
  fees: { monthlyCents: number; cardVirtualCents: number; cardPhysicalCents: number };
  entries: Entry[];
  cards: CardRow[];
  stripePublishableKey: string | null;
  payoutDestination: "iban" | "bank" | null;
}

const euro = (c: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(c / 100);
const when = (d: string) => new Date(d).toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const KIND: Record<string, string> = {
  TOPUP: "Opwaardering",
  WITHDRAWAL: "Opname",
  WITHDRAWAL_REVERSAL: "Terugboeking",
  FEE_MONTHLY: "Maandkosten",
  FEE_CARD: "Paskosten",
  CARD_SPEND: "Pasbetaling",
  CARD_REFUND: "Pas-terugbetaling",
  INVOICE_PAYMENT: "Factuur",
  EARNING: "Verdiensten",
  TRANSFER: "Overboeking",
  ADJUSTMENT: "Correctie",
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
  const [panel, setPanel] = useState<null | "topup" | "withdraw" | "iban">(null);
  const [filter, setFilter] = useState<"all" | "in" | "out">("all");
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState("50");
  const [iban, setIban] = useState("");
  const [ibanName, setIbanName] = useState("");
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));

  const load = useCallback(async () => {
    const [b, w, i] = await Promise.all([
      fetch("/api/me/bank?take=100", { cache: "no-store" }),
      fetch("/api/me/bank/withdraw", { cache: "no-store" }),
      fetch("/api/me/bank/pay-invoice", { cache: "no-store" }),
    ]);
    if (b.ok) {
      const d: Payload = await b.json();
      setData(d);
      setIban(d.account.payoutIban ?? "");
      setIbanName(d.account.payoutName ?? d.account.holderName);
    }
    if (w.ok) setWithdrawals((await w.json()).withdrawals);
    if (i.ok) setInvoices((await i.json()).invoices);
  }, []);

  useEffect(() => {
    void load();
    if (new URLSearchParams(window.location.search).get("opgewaardeerd")) {
      setNote({ ok: true, text: "Betaling ontvangen — je saldo wordt binnen een paar seconden bijgewerkt." });
      const t = setTimeout(() => void load(), 4000);
      return () => clearTimeout(t);
    }
  }, [load]);

  const cents = Math.round(Number(amount.replace(",", ".")) * 100);

  async function run(fn: () => Promise<Response>, ok: string, fallback: string, after?: (r: Response) => Promise<void>) {
    setBusy(true);
    setNote(null);
    try {
      const res = await fn();
      if (!res.ok) return setNote({ ok: false, text: await errorText(res, fallback) });
      if (after) await after(res);
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

  const shown = useMemo(
    () => (data?.entries ?? []).filter((e) => filter === "all" || (filter === "in" ? e.amountCents > 0 : e.amountCents < 0)),
    [data, filter],
  );

  if (!data) return <p className="py-16 text-center text-sm text-neutralx-400">Rekening laden…</p>;
  const { account, canMoveMoney, fees, role } = data;
  const field = "w-full rounded-lg border border-hairstrong bg-white px-3 py-2 text-sm";

  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0E5C4A] via-[#0A4B3C] to-[#062a22] p-6 text-white shadow-lift sm:p-8">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/60">ZekerFlex Bank</p>
            <p className="mt-1 text-sm text-white/80">{account.holderName}</p>
          </div>
          <span className="rounded-full bg-white/10 px-3 py-1 font-mono text-xs tracking-wider">{account.number}</span>
        </div>
        <p className="mt-6 text-xs text-white/60">Beschikbaar saldo</p>
        <p className="num font-display text-4xl font-bold sm:text-5xl">{euro(account.balanceCents)}</p>
        {canMoveMoney && role !== "platform" && !account.frozen && (
          <div className="mt-6 flex flex-wrap gap-2">
            <button type="button" onClick={() => setPanel(panel === "topup" ? null : "topup")} className="rounded-full bg-brand-mint px-4 py-2 text-sm font-semibold text-ink">
              + Opwaarderen
            </button>
            <button type="button" onClick={() => setPanel(panel === "withdraw" ? null : "withdraw")} className="rounded-full bg-white/15 px-4 py-2 text-sm font-semibold hover:bg-white/25">
              Opnemen naar mijn bank
            </button>
            <button type="button" onClick={() => setPanel(panel === "iban" ? null : "iban")} className="rounded-full bg-white/10 px-4 py-2 text-sm hover:bg-white/20">
              {account.payoutIban ? "IBAN wijzigen" : "IBAN instellen"}
            </button>
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
          <div className="flex items-center gap-2">
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
            <p className="text-sm text-neutralx-600">Stel eerst je eigen IBAN in.</p>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm text-neutralx-500">€</span>
              <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${field} max-w-[10rem]`} />
              <button
                type="button"
                disabled={busy || !(cents >= 100) || cents > account.balanceCents}
                onClick={() =>
                  run(() => json("/api/me/bank/withdraw", "POST", { amountCents: cents, requestKey: crypto.randomUUID() }), "Opname aangevraagd — het geld gaat met de eerstvolgende uitbetaling naar je bank.", "Opnemen lukte niet.")
                }
                className="btn-primary text-sm disabled:opacity-50"
              >
                {busy ? "Bezig…" : "Opnemen"}
              </button>
            </div>
          )}
          <p className="text-xs text-neutralx-500">Het bedrag wordt direct gereserveerd en via een SEPA-overboeking uitbetaald (meestal binnen 1–2 werkdagen).</p>
        </div>
      )}

      {panel === "iban" && (
        <div className="card grid gap-3 p-5 sm:grid-cols-[1fr_1fr_auto]">
          <input value={iban} onChange={(e) => setIban(e.target.value)} placeholder="NL00 BANK 0123 4567 89" className={field} />
          <input value={ibanName} onChange={(e) => setIbanName(e.target.value)} placeholder="Naam rekeninghouder" className={field} />
          <button type="button" disabled={busy} onClick={() => run(() => json("/api/me/bank/iban", "PUT", { iban, name: ibanName }), "IBAN opgeslagen.", "IBAN opslaan lukte niet.")} className="btn-primary text-sm disabled:opacity-50">
            Opslaan
          </button>
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
            className={`relative h-7 w-12 rounded-full transition ${data.payoutDestination === "bank" ? "bg-brand-500" : "bg-neutralx-300"}`}
          >
            <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${data.payoutDestination === "bank" ? "left-6" : "left-1"}`} />
          </button>
        </div>
      )}

      {role !== "platform" && (
        <BankCards
          cards={data.cards}
          fees={fees}
          canManage={canMoveMoney}
          frozen={account.frozen}
          balanceCents={account.balanceCents}
          holderName={account.holderName}
          publishableKey={data.stripePublishableKey}
          onChanged={async (n) => {
            setNote(n);
            await load();
          }}
        />
      )}

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

      {withdrawals.length > 0 && (
        <div className="card overflow-hidden">
          <div className="border-b border-hair px-5 py-3 text-sm font-semibold">Opnames</div>
          <ul className="divide-y divide-hair text-sm">
            {withdrawals.slice(0, 10).map((w) => (
              <li key={w.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                <span className="text-neutralx-600">{when(w.requestedAt)} · naar …{w.iban.slice(-4)}</span>
                <span className="flex items-center gap-3">
                  <span className={`text-xs ${w.status === "paid" ? "text-ok" : w.status === "reversed" ? "text-crit" : "text-warn"}`}>{W_STATUS[w.status]}</span>
                  <span className="num font-semibold">{euro(w.amountCents)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-hair px-5 py-3">
          <span className="text-sm font-semibold">Boekingen</span>
          <div className="ml-auto flex gap-1">
            {(["all", "in", "out"] as const).map((f) => (
              <button key={f} type="button" onClick={() => setFilter(f)} className={`rounded-full px-2.5 py-1 text-xs ${filter === f ? "bg-ink text-white" : "bg-paper-soft text-neutralx-600"}`}>
                {f === "all" ? "alles" : f === "in" ? "bij" : "af"}
              </button>
            ))}
          </div>
        </div>
        {shown.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-neutralx-400">Nog geen boekingen.</p>
        ) : (
          <ul className="divide-y divide-hair">
            {shown.map((e) => (
              <li key={e.id} className="flex items-center gap-3 px-5 py-3">
                <span className={`grid h-9 w-9 flex-shrink-0 place-items-center rounded-full text-sm ${e.amountCents > 0 ? "bg-ok/10 text-ok" : "bg-paper-soft text-neutralx-600"}`} aria-hidden>
                  {e.amountCents > 0 ? "↓" : "↑"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{e.description}</span>
                  <span className="block truncate text-xs text-neutralx-500">
                    {KIND[e.kind] ?? e.kind}
                    {e.counterparty ? ` · ${e.counterparty}` : ""} · {when(e.createdAt)}
                  </span>
                </span>
                <span className="text-right">
                  <span className={`num block text-sm font-semibold ${e.amountCents > 0 ? "text-ok" : "text-ink"}`}>
                    {e.amountCents > 0 ? "+" : "−"}
                    {euro(Math.abs(e.amountCents))}
                  </span>
                  <span className="num block text-[11px] text-neutralx-400">saldo {euro(e.balanceAfterCents)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-2 border-t border-hair px-5 py-3 text-xs">
          <span className="text-neutralx-500">Afschrift</span>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-lg border border-hairstrong px-2 py-1" />
          <a href={`/api/me/bank/statement?month=${month}`} className="font-semibold text-brand-600 hover:underline">
            Download (CSV)
          </a>
        </div>
      </div>

      <p className="text-xs leading-relaxed text-neutralx-400">
        {role !== "platform" && fees.monthlyCents > 0 ? `Kosten: ${euro(fees.monthlyCents)} per maand (eerste maand gratis). ` : ""}
        Het geld op ZekerFlex Bank-rekeningen staat op de rekening van ZekerFlex B.V. bij Stripe Payments Europe. Betalingen in en uit lopen via Stripe en SEPA.
      </p>
    </div>
  );
}
