"use client";

import { useEffect, useState } from "react";

interface Rules {
  earningPct: number;
  earningPotId: string | null;
  roundUp: boolean;
  roundUpPotId: string | null;
}

/** Automatic saving rules, shown under the pots. */
export function BankAutoSave(props: { pots: { id: string; name: string; emoji: string; kind: string }[]; earningsHere: boolean; onChanged: (n: { ok: boolean; text: string }) => void | Promise<void> }) {
  const { pots, earningsHere, onChanged } = props;
  const [rules, setRules] = useState<Rules | null>(null);
  const own = pots.filter((p) => p.kind === "POT");

  useEffect(() => {
    void fetch("/api/me/bank/autosave", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setRules(d.rules));
  }, []);

  if (!rules) return null;
  const sel = "rounded-lg border border-hairstrong bg-white px-2 py-1.5 text-sm";

  async function save(next: Rules) {
    setRules(next);
    const res = await fetch("/api/me/bank/autosave", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) }).catch(() => null);
    const d = res ? await res.json().catch(() => ({})) : {};
    await onChanged(res?.ok ? { ok: true, text: "Spaarregel opgeslagen." } : { ok: false, text: d?.error?.message ?? "Opslaan lukte niet." });
  }

  return (
    <div className="card space-y-4 p-5">
      <div>
        <p className="text-sm font-semibold text-ink">⚡ Automatisch sparen</p>
        <p className="text-xs text-neutralx-500">{own.length === 0 ? "Maak eerst een potje aan, dan kun je hier regels instellen." : "Sparen zonder erbij na te denken."}</p>
      </div>
      {own.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>Zet</span>
            <select value={rules.earningPct} onChange={(e) => save({ ...rules, earningPct: Number(e.target.value), earningPotId: rules.earningPotId ?? own[0]!.id })} className={sel}>
              {[0, 5, 10, 15, 20, 25, 30, 35, 40, 50].map((v) => (
                <option key={v} value={v}>
                  {v === 0 ? "niets" : `${v}%`}
                </option>
              ))}
            </select>
            <span>van elke uitbetaling in</span>
            <select value={rules.earningPotId ?? ""} onChange={(e) => save({ ...rules, earningPotId: e.target.value || null })} className={sel}>
              {own.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.emoji} {p.name}
                </option>
              ))}
            </select>
          </div>
          {!earningsHere && rules.earningPct > 0 && <p className="text-xs text-warn">Werkt zodra je verdiensten op ZekerFlex Bank ontvangt (Instellingen).</p>}
          <label className="flex flex-wrap items-center gap-2 text-sm">
            <input type="checkbox" checked={rules.roundUp} onChange={(e) => save({ ...rules, roundUp: e.target.checked, roundUpPotId: rules.roundUpPotId ?? own[0]!.id })} />
            <span>Rond pasbetalingen af naar boven en spaar het verschil in</span>
            <select value={rules.roundUpPotId ?? ""} onChange={(e) => save({ ...rules, roundUpPotId: e.target.value || null })} className={sel}>
              {own.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.emoji} {p.name}
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs text-neutralx-400">Voorbeeld: € 3,40 koffie → € 0,60 in je potje.</p>
        </>
      )}
    </div>
  );
}
