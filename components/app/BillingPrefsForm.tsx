"use client";

import { useState } from "react";

export function BillingPrefsForm({
  initial,
}: {
  initial: { billingEmail: string; splitByCostCentre: boolean; costCentres: string[] };
}) {
  const [billingEmail, setBillingEmail] = useState(initial.billingEmail);
  const [split, setSplit] = useState(initial.splitByCostCentre);
  const [centres, setCentres] = useState(initial.costCentres.join("\n"));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const costCentres = centres
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 50);
      const r = await fetch("/api/orgs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ billingEmail, splitByCostCentre: split, costCentres }),
      });
      setMsg(r.ok ? "Opgeslagen" : "Opslaan mislukt");
    } catch {
      setMsg("Opslaan mislukt");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5 p-5">
      <div>
        <label htmlFor="billing-email" className="field-label">
          Factuur-e-mailadres
        </label>
        <input
          id="billing-email"
          type="email"
          value={billingEmail}
          onChange={(e) => setBillingEmail(e.target.value)}
          placeholder="facturen@jouwbedrijf.nl"
          className="mt-1.5 w-full rounded-lg border border-hairstrong bg-white px-3 py-2 text-sm"
        />
        <p className="mt-1 text-xs text-neutralx-500">Hier ontvang je alle facturen. Leeg = het account-e-mailadres.</p>
      </div>

      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={split}
          onChange={(e) => setSplit(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-brand-500"
        />
        <span className="text-sm text-neutralx-700">
          <span className="font-medium text-ink">Aparte factuur per kostenplaats</span>
          <span className="mt-0.5 block text-xs text-neutralx-500">
            In plaats van één collectieve factuur ontvang je een factuur per afdeling, locatie of entiteit.
          </span>
        </span>
      </label>

      <div>
        <label htmlFor="cost-centres" className="field-label">
          PO-nummers / kostenplaatsen
        </label>
        <textarea
          id="cost-centres"
          rows={4}
          value={centres}
          onChange={(e) => setCentres(e.target.value)}
          placeholder={"Eén per regel, bijv.:\nPO-2026-Amsterdam\nPO-2026-Rotterdam"}
          className="mt-1.5 w-full rounded-lg border border-hairstrong bg-white px-3 py-2 text-sm leading-relaxed"
        />
        <p className="mt-1 text-xs text-neutralx-500">
          Bij het plaatsen van een dienst kies je welk PO-nummer erbij hoort. Dat bepaalt op welke factuur de dienst
          terechtkomt.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={saving} className="btn-primary text-sm">
          {saving ? "Bezig…" : "Opslaan"}
        </button>
        {msg && <span className="text-sm text-neutralx-600">{msg}</span>}
      </div>
    </div>
  );
}
