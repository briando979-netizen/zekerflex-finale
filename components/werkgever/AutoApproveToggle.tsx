"use client";

import { useEffect, useState } from "react";
import { useT } from "@/components/i18n/I18nProvider";

/** Werkgever → Uren: let the autopilot approve hours that exactly match the planning. */
export function AutoApproveToggle() {
  const a = useT().autoGoedkeuren;
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
            if (next && !window.confirm(a.bevestig)) return;
            setBusy(true);
            setErr(null);
            try {
              const r = await fetch("/api/werkgever/autopilot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ autoApproveHours: next }) });
              const d = await r.json();
              if (!r.ok) throw new Error(d?.error?.message ?? a.mislukt);
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
          <span className="block text-sm font-semibold text-ink">{a.kop}</span>
          <span className="block text-xs text-neutralx-500">
            {a.uitleg}
          </span>
          {err && <span role="alert" className="mt-1 block text-xs text-crit">{err}</span>}
        </span>
      </label>
    </div>
  );
}
