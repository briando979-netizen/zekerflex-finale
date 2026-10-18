"use client";

import { useCallback, useEffect, useState } from "react";

interface Order {
  id: string;
  target: { kind: "account"; number: string; holderName: string } | { kind: "pot"; potId: string; potName: string };
  amountCents: number;
  description: string;
  interval: "weekly" | "monthly";
  nextRunAt: string;
  active: boolean;
  lastRunAt?: string;
  lastError?: string;
}

const euro = (c: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(c / 100);

/** Recurring transfers — to someone else's ZekerFlex account or an own pot. */
export function BankStanding(props: { pots: { id: string; name: string; emoji: string; kind: string }[]; canManage: boolean; onChanged: (n: { ok: boolean; text: string }) => void | Promise<void> }) {
  const { pots, canManage, onChanged } = props;
  const own = pots.filter((p) => p.kind === "POT");
  const [orders, setOrders] = useState<Order[]>([]);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"pot" | "account">(own.length ? "pot" : "account");
  const [potId, setPotId] = useState(own[0]?.id ?? "");
  const [number, setNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");
  const [interval, setInterval] = useState<"weekly" | "monthly">("monthly");
  const [first, setFirst] = useState(() => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const field = "w-full rounded-lg border border-hairstrong bg-white px-3 py-2 text-sm";

  const load = useCallback(async () => {
    const r = await fetch("/api/me/bank/standing", { cache: "no-store" }).catch(() => null);
    if (r?.ok) setOrders((await r.json()).orders);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function call(url: string, method: string, body: unknown, ok: string) {
    setBusy(true);
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? null : JSON.stringify(body) }).catch(() => null);
    setBusy(false);
    const d = res ? await res.json().catch(() => ({})) : {};
    await onChanged(res?.ok ? { ok: true, text: ok } : { ok: false, text: d?.error?.message ?? "Dat lukte niet." });
    if (res?.ok) {
      setOpen(false);
      await load();
    }
  }

  const cents = Math.round(Number(amount.replace(",", ".")) * 100);

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-hair px-5 py-3">
        <span className="text-sm font-semibold">🔁 Vaste opdrachten</span>
        {canManage && (
          <button type="button" onClick={() => setOpen(!open)} className="ml-auto rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-white">
            {open ? "Annuleren" : "+ Nieuwe opdracht"}
          </button>
        )}
      </div>
      {open && (
        <div className="space-y-3 border-b border-hair bg-paper-soft/50 p-5">
          <div className="flex gap-2">
            {own.length > 0 && (
              <button type="button" onClick={() => setKind("pot")} className={`rounded-full border px-3 py-1.5 text-sm ${kind === "pot" ? "border-brand-500 bg-white font-semibold" : "border-hairstrong"}`}>
                Naar mijn potje
              </button>
            )}
            <button type="button" onClick={() => setKind("account")} className={`rounded-full border px-3 py-1.5 text-sm ${kind === "account" ? "border-brand-500 bg-white font-semibold" : "border-hairstrong"}`}>
              Naar iemand anders
            </button>
          </div>
          {kind === "pot" ? (
            <select value={potId} onChange={(e) => setPotId(e.target.value)} className={field}>
              {own.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.emoji} {p.name}
                </option>
              ))}
            </select>
          ) : (
            <input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="ZF 12 3456 7890" className={`${field} font-mono`} />
          )}
          <div className="grid gap-2 sm:grid-cols-3">
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="€ bedrag" className={field} />
            <select value={interval} onChange={(e) => setInterval(e.target.value as "weekly" | "monthly")} className={field}>
              <option value="monthly">elke maand</option>
              <option value="weekly">elke week</option>
            </select>
            <label className="text-xs text-neutralx-500">
              Eerste keer
              <input type="date" value={first} onChange={(e) => setFirst(e.target.value)} className={field} />
            </label>
          </div>
          {kind === "account" && <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Omschrijving, bv. Huur garagebox" maxLength={140} className={field} />}
          <button
            type="button"
            disabled={busy || !(cents >= 100) || (kind === "pot" ? !potId : number.replace(/\s/g, "").length < 12)}
            onClick={() =>
              call(
                "/api/me/bank/standing",
                "POST",
                { target: kind === "pot" ? { kind, potId } : { kind, number }, amountCents: cents, description: desc, interval, firstRun: first },
                "Vaste opdracht aangemaakt.",
              )
            }
            className="btn-primary text-sm disabled:opacity-50"
          >
            Opdracht opslaan
          </button>
        </div>
      )}
      {orders.length === 0 ? (
        <p className="px-5 py-6 text-center text-sm text-neutralx-400">Nog geen vaste opdrachten. Spaar elke maand automatisch of betaal iets terugkerends.</p>
      ) : (
        <ul className="divide-y divide-hair text-sm">
          {orders.map((o) => (
            <li key={o.id} className={`flex flex-wrap items-center gap-3 px-5 py-3 ${o.active ? "" : "opacity-50"}`}>
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-ink">
                  {euro(o.amountCents)} {o.interval === "weekly" ? "per week" : "per maand"} → {o.target.kind === "account" ? o.target.holderName : o.target.potName}
                </span>
                <span className="block text-xs text-neutralx-500">
                  {o.active ? `volgende keer ${new Date(o.nextRunAt).toLocaleDateString("nl-NL")}` : "gepauzeerd"}
                  {o.description ? ` · ${o.description}` : ""}
                </span>
                {o.lastError && o.active && <span className="block text-xs text-crit">Laatste poging mislukt: {o.lastError} — we proberen het morgen opnieuw.</span>}
              </span>
              {canManage && (
                <>
                  <button type="button" disabled={busy} onClick={() => call(`/api/me/bank/standing/${o.id}`, "PATCH", { active: !o.active }, o.active ? "Gepauzeerd." : "Hervat.")} className="text-xs font-semibold text-ink hover:underline">
                    {o.active ? "Pauzeren" : "Hervatten"}
                  </button>
                  <button type="button" disabled={busy} onClick={() => window.confirm("Deze vaste opdracht stoppen?") && call(`/api/me/bank/standing/${o.id}`, "DELETE", undefined, "Opdracht gestopt.")} className="text-xs text-neutralx-500 hover:text-crit">
                    Stoppen
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
