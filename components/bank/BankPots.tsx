"use client";

import { useState } from "react";

export interface Pot {
  id: string;
  name: string;
  emoji: string;
  kind: "POT" | "FIXED" | string;
  balanceCents: number;
  targetCents: number | null;
  termYears: number | null;
  interestBps: number;
  lockedUntil: string | null;
  createdAt: string;
}

const euro = (c: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(c / 100);
const pct = (bps: number) => `${(bps / 100).toFixed(2).replace(".", ",")}%`;
const EMOJI = ["🎯", "🏖️", "🚗", "🏠", "🎓", "💻", "🧾", "🎁", "🛠️", "🐷"];
const toCents = (v: string) => Math.round(Number(v.replace(",", ".")) * 100);

export function BankPots(props: {
  pots: Pot[];
  rates: Record<string, number>;
  balanceCents: number;
  canManage: boolean;
  onChanged: (note: { ok: boolean; text: string }) => void | Promise<void>;
}) {
  const { pots, rates, balanceCents, canManage, onChanged } = props;
  const [mode, setMode] = useState<null | "pot" | "deposit">(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🎯");
  const [target, setTarget] = useState("");
  const [depositAmount, setDepositAmount] = useState("1000");
  const terms = Object.keys(rates).map(Number).sort((a, b) => a - b);
  const [term, setTerm] = useState(terms[0] ?? 1);
  const [move, setMove] = useState<{ id: string; dir: "in" | "out"; amount: string } | null>(null);
  const field = "w-full rounded-lg border border-hairstrong bg-white px-3 py-2 text-sm";

  async function call(url: string, method: string, body: unknown, ok: string) {
    setBusy(true);
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? null : JSON.stringify(body) }).catch(() => null);
    setBusy(false);
    const d = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) return onChanged({ ok: false, text: d?.error?.message ?? "Dat lukte niet." });
    setMode(null);
    setMove(null);
    await onChanged({ ok: true, text: ok });
  }

  const potsOnly = pots.filter((p) => p.kind !== "FIXED");
  const deposits = pots.filter((p) => p.kind === "FIXED");
  const dep = toCents(depositAmount);
  const bps = rates[String(term)] ?? 0;
  const interest = Number.isFinite(dep) ? Math.round((dep * bps * term) / 10_000) : 0;

  return (
    <div className="space-y-5">
      {canManage && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setMode(mode === "pot" ? null : "pot")} className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white">
            + Nieuw potje
          </button>
          <button type="button" onClick={() => setMode(mode === "deposit" ? null : "deposit")} className="rounded-full border border-hairstrong px-4 py-2 text-sm font-semibold text-ink">
            🔒 Geld vastzetten
          </button>
        </div>
      )}

      {mode === "pot" && (
        <div className="card space-y-3 p-5">
          <p className="text-sm font-semibold text-ink">Nieuw potje</p>
          <div className="flex flex-wrap gap-1.5">
            {EMOJI.map((e) => (
              <button key={e} type="button" onClick={() => setEmoji(e)} className={`grid h-9 w-9 place-items-center rounded-full text-lg ${emoji === e ? "bg-brand-50 ring-2 ring-brand-500" : "bg-paper-soft"}`}>
                {e}
              </button>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Naam, bv. Vakantie of Belasting" className={field} />
            <input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Spaardoel in € (optioneel)" className={field} />
          </div>
          <button
            type="button"
            disabled={busy || !name.trim()}
            onClick={() => call("/api/me/bank/pots", "POST", { action: "create", name, emoji, targetCents: target ? toCents(target) || null : null }, `Potje ${emoji} ${name} aangemaakt.`)}
            className="btn-primary text-sm disabled:opacity-50"
          >
            Aanmaken
          </button>
        </div>
      )}

      {mode === "deposit" && (
        <div className="card space-y-4 p-5">
          <div>
            <p className="text-sm font-semibold text-ink">Geld vastzetten</p>
            <p className="text-xs text-neutralx-500">Vaste rente over de hele looptijd. Je kunt er tot de einddatum niet bij; daarna komt het met rente vanzelf terug op je rekening.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {terms.map((t) => (
              <button key={t} type="button" onClick={() => setTerm(t)} className={`rounded-xl border px-4 py-2 text-left ${term === t ? "border-brand-500 bg-brand-50" : "border-hairstrong"}`}>
                <span className="block text-sm font-semibold text-ink">{t} jaar</span>
                <span className="block text-xs text-neutralx-500">{pct(rates[String(t)] ?? 0)} per jaar</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-neutralx-500">€</span>
            <input inputMode="decimal" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} className={`${field} max-w-[10rem]`} />
            <span className="text-sm text-neutralx-600">
              → na {term} jaar <span className="num font-semibold text-ok">{euro((Number.isFinite(dep) ? dep : 0) + interest)}</span> (rente {euro(interest)})
            </span>
          </div>
          <button
            type="button"
            disabled={busy || !(dep >= 10_000) || dep > balanceCents}
            onClick={() => call("/api/me/bank/pots", "POST", { action: "deposit", amountCents: dep, termYears: term, requestKey: crypto.randomUUID() }, `${euro(dep)} vastgezet voor ${term} jaar.`)}
            className="btn-primary text-sm disabled:opacity-50"
          >
            {dep > balanceCents ? "Onvoldoende saldo" : `${euro(Number.isFinite(dep) ? dep : 0)} vastzetten`}
          </button>
          <p className="text-xs text-neutralx-400">Vanaf € 100. Rente wordt op de einddatum uitgekeerd door ZekerFlex B.V.</p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {potsOnly.length === 0 && deposits.length === 0 && (
          <p className="card p-8 text-center text-sm text-neutralx-400 sm:col-span-2">Nog geen potjes. Zet geld apart voor belasting, vakantie of een nieuwe laptop — het blijft van jou, maar je geeft het niet per ongeluk uit.</p>
        )}
        {potsOnly.map((p) => {
          const progress = p.targetCents ? Math.min(100, Math.round((p.balanceCents / p.targetCents) * 100)) : null;
          return (
            <div key={p.id} className="card space-y-3 p-5">
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-paper-soft text-2xl">{p.emoji}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-ink">{p.name}</span>
                  <span className="num block font-display text-xl font-bold text-ink">{euro(p.balanceCents)}</span>
                </span>
              </div>
              {progress !== null && (
                <div>
                  <div className="h-2 overflow-hidden rounded-full bg-paper-soft">
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${progress}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-neutralx-500">
                    {progress}% van {euro(p.targetCents!)}
                  </p>
                </div>
              )}
              {canManage &&
                (move?.id === p.id ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <input inputMode="decimal" autoFocus value={move.amount} onChange={(e) => setMove({ ...move, amount: e.target.value })} placeholder="€" className={`${field} max-w-[7rem]`} />
                    <button
                      type="button"
                      disabled={busy || !(toCents(move.amount) > 0)}
                      onClick={() => call(`/api/me/bank/pots/${p.id}`, "POST", { direction: move.dir, amountCents: toCents(move.amount), requestKey: crypto.randomUUID() }, move.dir === "in" ? `Naar ${p.name} gezet.` : `Uit ${p.name} gehaald.`)}
                      className="btn-primary text-xs disabled:opacity-50"
                    >
                      {move.dir === "in" ? "Erin" : "Eruit"}
                    </button>
                    <button type="button" onClick={() => setMove(null)} className="text-xs text-neutralx-500">
                      annuleer
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-3 text-xs font-semibold">
                    <button type="button" onClick={() => setMove({ id: p.id, dir: "in", amount: "" })} className="text-brand-600 hover:underline">
                      + Geld erin
                    </button>
                    <button type="button" disabled={p.balanceCents === 0} onClick={() => setMove({ id: p.id, dir: "out", amount: "" })} className="text-ink hover:underline disabled:opacity-40">
                      Geld eruit
                    </button>
                    <button
                      type="button"
                      onClick={() => window.confirm(`Potje ${p.name} opheffen?${p.balanceCents ? ` ${euro(p.balanceCents)} gaat terug naar je rekening.` : ""}`) && call(`/api/me/bank/pots/${p.id}`, "DELETE", undefined, "Potje opgeheven.")}
                      className="ml-auto font-normal text-neutralx-500 hover:text-crit"
                    >
                      Opheffen
                    </button>
                  </div>
                ))}
            </div>
          );
        })}
        {deposits.map((p) => {
          const end = p.lockedUntil ? new Date(p.lockedUntil) : null;
          const start = new Date(p.createdAt).getTime();
          const done = end ? Math.min(100, Math.max(0, Math.round(((Date.now() - start) / (end.getTime() - start)) * 100))) : 0;
          const interest = Math.round((p.balanceCents * p.interestBps * (p.termYears ?? 0)) / 10_000);
          return (
            <div key={p.id} className="card space-y-3 border-brand-500/30 bg-gradient-to-br from-brand-50/60 to-transparent p-5">
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-2xl">🔒</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-ink">{p.name}</span>
                  <span className="num block font-display text-xl font-bold text-ink">{euro(p.balanceCents)}</span>
                  <span className="block text-xs text-neutralx-500">
                    {pct(p.interestBps)} per jaar · + {euro(interest)} rente
                  </span>
                </span>
              </div>
              <div>
                <div className="h-2 overflow-hidden rounded-full bg-white">
                  <div className="h-full rounded-full bg-ok" style={{ width: `${done}%` }} />
                </div>
                <p className="mt-1 text-xs text-neutralx-500">Vrij op {end?.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" })}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
