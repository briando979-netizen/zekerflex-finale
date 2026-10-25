"use client";

import { copyText } from "@/lib/clipboard";

import { useCallback, useEffect, useState } from "react";

interface PayRequest {
  id: string;
  amountCents: number;
  description: string;
  status: "open" | "paid" | "cancelled";
  createdAt: string;
  expiresAt: string;
  paidBy?: string;
}

const euro = (c: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(c / 100);
const toCents = (v: string) => Math.round(Number(v.replace(",", ".")) * 100);

/** Send money to another ZekerFlex account, and payment requests with a share link. */
export function BankPayments(props: { canManage: boolean; balanceCents: number; onChanged: (n: { ok: boolean; text: string }) => void | Promise<void> }) {
  const { canManage, balanceCents, onChanged } = props;
  const [to, setTo] = useState("");
  const [holder, setHolder] = useState<string | null | undefined>(undefined);
  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");
  const [reqAmount, setReqAmount] = useState("");
  const [reqDesc, setReqDesc] = useState("");
  const [requests, setRequests] = useState<PayRequest[]>([]);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const field = "w-full rounded-lg border border-hairstrong bg-white px-3 py-2 text-sm";

  const load = useCallback(async () => {
    const r = await fetch("/api/me/bank/requests", { cache: "no-store" }).catch(() => null);
    if (r?.ok) setRequests((await r.json()).requests);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  // Name check once a full account number is typed.
  useEffect(() => {
    const n = to.replace(/\s/g, "").toUpperCase();
    if (!/^ZF\d{10}$/.test(n)) return setHolder(undefined);
    const t = setTimeout(async () => {
      const r = await fetch(`/api/me/bank/send?number=${n}`).catch(() => null);
      const d = r?.ok ? await r.json() : null;
      setHolder(d?.found ? d.holderName : null);
    }, 300);
    return () => clearTimeout(t);
  }, [to]);

  async function post(url: string, body: unknown, ok: string) {
    setBusy(true);
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    setBusy(false);
    const d = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) {
      await onChanged({ ok: false, text: d?.error?.message ?? "Dat lukte niet." });
      return null;
    }
    await onChanged({ ok: true, text: ok });
    return d;
  }

  const link = (id: string) => `${window.location.origin}/betaalverzoek/${id}`;
  async function share(r: PayRequest) {
    const url = link(r.id);
    const text = `Wil je ${euro(r.amountCents)} betalen${r.description ? ` voor ${r.description}` : ""}? ${url}`;
    try {
      if (navigator.share) await navigator.share({ title: "Betaalverzoek", text, url });
      else {
        await copyText(url);
        setCopied(r.id);
        setTimeout(() => setCopied(null), 2000);
      }
    } catch {
      /* cancelled */
    }
  }

  const cents = toCents(amount);
  const reqCents = toCents(reqAmount);

  return (
    <div className="space-y-5">
      {canManage && (
        <div className="card space-y-3 p-5">
          <p className="text-sm font-semibold text-ink">Geld overmaken naar een ZekerFlex-rekening</p>
          <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="ZF 12 3456 7890" className={`${field} font-mono`} />
          {holder !== undefined && (
            <p className={`text-xs ${holder ? "text-ok" : "text-crit"}`}>{holder ? `✓ ${holder}` : "Dit rekeningnummer bestaat niet"}</p>
          )}
          <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="€ bedrag" className={field} />
            <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Omschrijving (optioneel)" maxLength={140} className={field} />
          </div>
          <button
            type="button"
            disabled={busy || !holder || !(cents > 0) || cents > balanceCents}
            onClick={async () => {
              if (await post("/api/me/bank/send", { toNumber: to, amountCents: cents, description: desc, requestKey: crypto.randomUUID() }, `${euro(cents)} overgemaakt naar ${holder}.`)) {
                setAmount("");
                setDesc("");
              }
            }}
            className="btn-primary text-sm disabled:opacity-50"
          >
            {cents > balanceCents ? "Onvoldoende saldo" : `Direct overmaken${cents > 0 ? ` (${euro(cents)})` : ""}`}
          </button>
          <p className="text-xs text-neutralx-400">Komt direct aan, gratis. Daglimiet € 2.500.</p>
        </div>
      )}

      <div className="card space-y-3 p-5">
        <p className="text-sm font-semibold text-ink">Betaalverzoek maken</p>
        <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
          <input inputMode="decimal" value={reqAmount} onChange={(e) => setReqAmount(e.target.value)} placeholder="€ bedrag" className={field} />
          <input value={reqDesc} onChange={(e) => setReqDesc(e.target.value)} placeholder="Waarvoor? bv. Lunch vrijdag" maxLength={140} className={field} />
        </div>
        <button
          type="button"
          disabled={busy || !(reqCents >= 100)}
          onClick={async () => {
            const d = await post("/api/me/bank/requests", { amountCents: reqCents, description: reqDesc }, "Betaalverzoek gemaakt — deel de link of laat de QR-code scannen.");
            if (d?.request) {
              setReqAmount("");
              setReqDesc("");
              await load();
              void share(d.request);
            }
          }}
          className="btn-primary text-sm disabled:opacity-50"
        >
          Verzoek maken &amp; delen
        </button>
      </div>

      {requests.length > 0 && (
        <div className="card overflow-hidden">
          <div className="border-b border-hair px-5 py-3 text-sm font-semibold">Mijn betaalverzoeken</div>
          <ul className="divide-y divide-hair text-sm">
            {requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-ink">
                    {euro(r.amountCents)} {r.description && <span className="font-normal text-neutralx-500">· {r.description}</span>}
                  </span>
                  <span className="block text-xs text-neutralx-500">
                    {r.status === "paid" ? `betaald door ${r.paidBy}` : r.status === "open" ? `open tot ${new Date(r.expiresAt).toLocaleDateString("nl-NL")}` : "ingetrokken/verlopen"}
                  </span>
                </span>
                {r.status === "open" && (
                  <>
                    <a href={`/betaalverzoek/${r.id}`} target="_blank" rel="noreferrer" className="text-xs font-semibold text-ink hover:underline">
                      QR tonen
                    </a>
                    <button type="button" onClick={() => share(r)} className="text-xs font-semibold text-brand-600 hover:underline">
                      {copied === r.id ? "Link gekopieerd ✓" : "Delen"}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await fetch(`/api/me/bank/requests/${r.id}`, { method: "DELETE" });
                        await load();
                      }}
                      className="text-xs text-neutralx-500 hover:text-crit"
                    >
                      Intrekken
                    </button>
                  </>
                )}
                {r.status === "paid" && <span className="rounded-full bg-ok/10 px-2 py-0.5 text-[11px] font-semibold text-ok">betaald</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
