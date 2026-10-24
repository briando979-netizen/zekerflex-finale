"use client";

import { useCallback, useEffect, useState } from "react";

interface Rules {
  perTxLimitCents: number;
  dailyBudgetCents: number;
  weeklyBudgetCents: number;
  blockedMccs: string[];
  allowedCountries: string[];
  aiCheck: boolean;
}
interface LogEntry {
  id: string;
  cardId: string;
  amountCents: number;
  merchant: string | null;
  approved: boolean;
  reason: string;
  at: string;
}

const eur = (c: number) => `€ ${(c / 100).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function IssuingRulesPanel() {
  const [rules, setRules] = useState<Rules | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/issuing/rules", { cache: "no-store" });
    if (r.ok) {
      const d = await r.json();
      setRules(d.rules);
      setLog(d.log ?? []);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!rules) return;
    setSaving(true);
    setMsg(null);
    try {
      const r = await fetch("/api/admin/issuing/rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rules),
      });
      setMsg(r.ok ? "Opgeslagen." : "Opslaan mislukt.");
      if (r.ok) await load();
    } finally {
      setSaving(false);
    }
  };

  const panel = { background: "var(--a-elev)", border: "1px solid var(--a-border)" };
  const text = { color: "var(--a-text)" };
  const mute = { color: "var(--a-mute)" };
  const input = { background: "var(--a-panel)", border: "1px solid var(--a-border)", color: "var(--a-text)" };

  if (!rules) return <div className="h-40 animate-pulse rounded-xl" style={{ background: "var(--a-elev)" }} />;

  return (
    <div className="space-y-4">
      <div className="rounded-xl p-4" style={panel}>
        <p className="mb-1 text-sm font-semibold" style={text}>
          Issuing-kaartregels (standaard voor alle kaarten)
        </p>
        <p className="mb-3 text-xs" style={mute}>
          Dit zijn de vangrails die het autorisatie-webhook gebruikt om kaartbetalingen goed te keuren of te weigeren.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Field label="Max per transactie (€)" value={rules.perTxLimitCents / 100} onChange={(n) => setRules({ ...rules, perTxLimitCents: Math.round(n * 100) })} style={input} />
          <Field label="Dagbudget per kaart (€)" value={rules.dailyBudgetCents / 100} onChange={(n) => setRules({ ...rules, dailyBudgetCents: Math.round(n * 100) })} style={input} />
          <Field label="Weekbudget per kaart (€)" value={rules.weeklyBudgetCents / 100} onChange={(n) => setRules({ ...rules, weeklyBudgetCents: Math.round(n * 100) })} style={input} />
          <TextField label="Geblokkeerde categorieën (MCC, komma)" value={rules.blockedMccs.join(", ")} onChange={(s) => setRules({ ...rules, blockedMccs: splitList(s) })} style={input} />
          <TextField label="Toegestane landen (ISO-2, komma; leeg = alle)" value={rules.allowedCountries.join(", ")} onChange={(s) => setRules({ ...rules, allowedCountries: splitList(s) })} style={input} />
          <label className="flex items-center gap-2 self-end pb-1.5 text-sm" style={text}>
            <input type="checkbox" checked={rules.aiCheck} onChange={(e) => setRules({ ...rules, aiCheck: e.target.checked })} />
            AI-risicocheck aan
          </label>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button type="button" onClick={save} disabled={saving} className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" style={{ background: "var(--a-accent, #0E5C4A)" }}>
            {saving ? "Opslaan…" : "Regels opslaan"}
          </button>
          {msg && <span className="text-xs" style={mute}>{msg}</span>}
        </div>
      </div>

      <div className="rounded-xl p-4" style={panel}>
        <p className="mb-2 text-sm font-semibold" style={text}>Autorisatielogboek (recent)</p>
        {log.length === 0 ? (
          <p className="text-xs" style={mute}>Nog geen kaartautorisaties.</p>
        ) : (
          <ul className="divide-y text-sm" style={{ borderColor: "var(--a-border)" }}>
            {log.map((e) => (
              <li key={e.id + e.at} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0" style={text}>
                  <span className={e.approved ? "" : "line-through"}>{e.merchant ?? "Onbekende winkel"}</span>{" "}
                  <span style={mute}>· {eur(e.amountCents)}</span>
                </span>
                <span className="flex-shrink-0 text-xs" style={{ color: e.approved ? "#34d399" : "#f87171" }}>
                  {e.approved ? "goedgekeurd" : `geweigerd — ${e.reason}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function splitList(s: string): string[] {
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function Field({ label, value, onChange, style }: { label: string; value: number; onChange: (n: number) => void; style: React.CSSProperties }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs" style={{ color: "var(--a-mute)" }}>{label}</span>
      <input type="number" step="1" defaultValue={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full rounded-lg px-2.5 py-1.5 text-sm" style={style} />
    </label>
  );
}
function TextField({ label, value, onChange, style }: { label: string; value: string; onChange: (s: string) => void; style: React.CSSProperties }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs" style={{ color: "var(--a-mute)" }}>{label}</span>
      <input type="text" defaultValue={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg px-2.5 py-1.5 text-sm" style={style} />
    </label>
  );
}
