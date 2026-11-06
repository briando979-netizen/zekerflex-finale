"use client";

import { useState } from "react";
import { PURCHASE_MODES_FEATURES } from "@/lib/flags/purchase-modes";

// Admin panel to enable/disable purchase modes globally and set pricing

export function PurchaseModesAdmin() {
  const [settings, setSettings] = useState(PURCHASE_MODES_FEATURES);
  const [saved, setSaved] = useState(false);

  async function saveSettings() {
    try {
      const res = await fetch("/api/admin/shop/purchase-modes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold" style={{ color: "var(--a-text)" }}>
          Aankoopmodi
        </h3>
        <p className="text-sm" style={{ color: "var(--a-mute)" }}>
          Klanten kunnen kiezen tussen eenmalige aankoop of maandelijks abonnement.
        </p>
      </div>

      <div className="space-y-3 rounded-lg border p-4" style={{ borderColor: "var(--a-border)" }}>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.showToggle}
            onChange={(e) => setSettings({ ...settings, showToggle: e.target.checked })}
          />
          <span className="text-sm">Toggle in winkelwagen tonen</span>
        </label>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.enableSubscription}
            onChange={(e) => setSettings({ ...settings, enableSubscription: e.target.checked })}
          />
          <span className="text-sm">Maandelijks abonnement aanbieden</span>
        </label>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.enableOneTime}
            onChange={(e) => setSettings({ ...settings, enableOneTime: e.target.checked })}
          />
          <span className="text-sm">Eenmalige aankoop aanbieden</span>
        </label>

        <div className="flex items-center gap-2 border-t pt-3" style={{ borderColor: "var(--a-border)" }}>
          <label className="text-sm">
            Abonnementskorting: {Math.round(settings.subscriptionDiscount * 100)}%
          </label>
          <input
            type="range"
            min="0"
            max="50"
            step="1"
            value={Math.round(settings.subscriptionDiscount * 100)}
            onChange={(e) =>
              setSettings({ ...settings, subscriptionDiscount: parseInt(e.target.value) / 100 })
            }
            className="w-32"
          />
        </div>
      </div>

      <button
        onClick={saveSettings}
        className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
        style={{ background: "var(--a-act)" }}
      >
        Opslaan
      </button>

      {saved && (
        <p className="text-sm text-green-600" style={{ color: "var(--a-ok)" }}>
          ✓ Instellingen opgeslagen
        </p>
      )}
    </div>
  );
}
