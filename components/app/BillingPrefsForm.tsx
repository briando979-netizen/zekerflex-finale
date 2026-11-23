"use client";

import { useState } from "react";
import Link from "next/link";
import { useT } from "@/components/i18n/I18nProvider";

export function BillingPrefsForm({
  initial,
}: {
  initial: { billingEmail: string; splitByCostCentre: boolean; costCentres: string[] };
}) {
  const b = useT().billing;
  const [billingEmail, setBillingEmail] = useState(initial.billingEmail);
  const [split, setSplit] = useState(initial.splitByCostCentre);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      // de kostenplaatsen zelf bewaart deze knop niet meer: die staan onder Instellingen → Kostenplaatsen
      const r = await fetch("/api/orgs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ billingEmail, splitByCostCentre: split }),
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

      {/* de kostenplaatsen beheer je sinds 23 nov 2026 onder Instellingen → Kostenplaatsen (alleen daar geldt de regel "niet wijzigen of
          verwijderen zolang ze in gebruik zijn"); hier staat alleen wat erin staat, met de link */}
      <div>
        <p className="field-label">{b.poLabel}</p>
        <p className="mt-1.5 break-words text-sm text-neutralx-700">{initial.costCentres.length > 0 ? initial.costCentres.join(", ") : b.poGeen}</p>
        <p className="mt-1 text-xs text-neutralx-500">{b.poHint}</p>
        <Link href="/werkgever/instellingen/kostenplaatsen" className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-600 hover:underline">
          {b.poBeheer}
        </Link>
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
