"use client";

import { useEffect, useState } from "react";

/** Werkgever → Uren: let the autopilot approve hours that exactly match the planning. */
export function AutoApproveToggle() {
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/werkgever/autopilot", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setOn(Boolean(d?.autoApproveHours)))
      .catch(() => setOn(false));
  }, []);

  if (on === null) return null;
  return (
    <div className="mb-6 rounded-2xl border border-hair bg-white px-5 py-4">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={on}
          disabled={busy}
          onChange={async (e) => {
            const next = e.target.checked;
            if (next && !window.confirm("Automatisch goedkeuren aanzetten? De AI keurt dan uren goed die precies kloppen met de planning, met jouw rechten. Daarmee worden factuur en uitbetaling gestart.")) return;
            setBusy(true);
            setErr(null);
            try {
              const r = await fetch("/api/werkgever/autopilot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ autoApproveHours: next }) });
              const d = await r.json();
              if (!r.ok) throw new Error(d?.error?.message ?? "Opslaan mislukt");
              setOn(Boolean(d.autoApproveHours));
            } catch (e2) {
              setErr((e2 as Error).message);
            } finally {
              setBusy(false);
            }
          }}
          className="mt-1 h-4 w-4 accent-brand-500"
        />
        <span>
          <span className="block text-sm font-semibold text-ink">🤖 Uren automatisch goedkeuren</span>
          <span className="block text-xs text-neutralx-500">
            Na 24 uur keurt de autopilot uren goed als begin- en eindtijd binnen 15 minuten van de planning liggen, er niet meer uren zijn
            geschreven dan gepland, de GPS-check-in klopt en er geen fraudesignalen zijn. Al het andere blijft voor jou. Je kunt het altijd
            weer uitzetten.
          </span>
          {err && <span className="mt-1 block text-xs text-crit">{err}</span>}
        </span>
      </label>
    </div>
  );
}
