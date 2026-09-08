"use client";

import { useState } from "react";
import { useT } from "@/components/i18n/I18nProvider";

export function BillingPrefsForm({
  initial,
}: {
  initial: { billingEmail: string; splitByCostCentre: boolean; costCentres: string[] };
}) {
  const b = useT().billing;
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
      setMsg(r.ok ? b.saved : b.saveFailed);
    } catch {
      setMsg(b.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5 p-5">
      <div>
        <label htmlFor="billing-email" className="field-label">
          {b.emailLabel}
        </label>
        <input
          id="billing-email"
          type="email"
          value={billingEmail}
          onChange={(e) => setBillingEmail(e.target.value)}
          placeholder={b.emailPh}
          className="mt-1.5 w-full rounded-lg border border-hairstrong bg-white px-3 py-2 text-sm"
        />
        <p className="mt-1 text-xs text-neutralx-500">{b.emailHint}</p>
      </div>

      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={split}
          onChange={(e) => setSplit(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-brand-500"
        />
        <span className="text-sm text-neutralx-700">
          <span className="font-medium text-ink">{b.splitLabel}</span>
          <span className="mt-0.5 block text-xs text-neutralx-500">{b.splitHint}</span>
        </span>
      </label>

      <div>
        <label htmlFor="cost-centres" className="field-label">
          {b.poLabel}
        </label>
        <textarea
          id="cost-centres"
          rows={4}
          value={centres}
          onChange={(e) => setCentres(e.target.value)}
          placeholder={b.poPh}
          className="mt-1.5 w-full rounded-lg border border-hairstrong bg-white px-3 py-2 text-sm leading-relaxed"
        />
        <p className="mt-1 text-xs text-neutralx-500">{b.poHint}</p>
      </div>

      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={saving} className="btn-primary text-sm">
          {saving ? b.saving : b.save}
        </button>
        {msg && <span className="text-sm text-neutralx-600">{msg}</span>}
      </div>
    </div>
  );
}
