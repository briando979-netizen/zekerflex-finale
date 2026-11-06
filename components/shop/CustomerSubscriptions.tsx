"use client";

import { useState } from "react";
import type { SubscriptionStatus } from "@/lib/shop/subscription-manager";
import { cancelSubscription, upgradeSubscription, pauseSubscription } from "@/lib/shop/subscription-manager";

interface Props {
  subscriptions: SubscriptionStatus[];
  onUpdated: () => void;
}

export function CustomerSubscriptions({ subscriptions, onUpdated }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  async function handleCancel(id: string) {
    if (!confirm("Weet je zeker dat je dit abonnement wilt opzeggen?")) return;
    setBusy(id);
    try {
      const res = await cancelSubscription(id, false);
      setMessage({ type: "ok", text: "Abonnement opgezegd na deze periode." });
      onUpdated();
    } catch (e) {
      setMessage({ type: "error", text: "Fout bij opzeggen" });
    } finally {
      setBusy(null);
    }
  }

  async function handlePause(id: string) {
    setBusy(id);
    try {
      const res = await pauseSubscription(id);
      setMessage({ type: "ok", text: "Abonnement gepauzeerd." });
      onUpdated();
    } catch (e) {
      setMessage({ type: "error", text: "Fout bij pauzeren" });
    } finally {
      setBusy(null);
    }
  }

  if (!subscriptions.length) {
    return (
      <div className="rounded-lg border p-4 text-center" style={{ borderColor: "var(--a-border)" }}>
        <p style={{ color: "var(--a-mute)" }}>Geen actieve abonnementen</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="font-semibold" style={{ color: "var(--a-text)" }}>
        Actieve abonnementen
      </h3>

      {message && (
        <div
          className="rounded-lg p-3 text-sm"
          style={{
            background: message.type === "ok" ? "rgba(34, 197, 94, 0.1)" : "rgba(239, 68, 68, 0.1)",
            color: message.type === "ok" ? "var(--a-ok)" : "var(--a-crit)",
          }}
        >
          {message.text}
        </div>
      )}

      {subscriptions.map((sub) => (
        <div
          key={sub.id}
          className="space-y-3 rounded-lg border p-4"
          style={{ borderColor: "var(--a-border)" }}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="font-medium" style={{ color: "var(--a-text)" }}>
                {sub.productName}
              </p>
              <p className="text-sm" style={{ color: "var(--a-mute)" }}>
                € {(sub.monthlyPriceCents / 100).toFixed(2)}/maand
              </p>
            </div>
            <span
              className="rounded px-2 py-1 text-xs font-semibold"
              style={{
                background:
                  sub.status === "active"
                    ? "rgba(34, 197, 94, 0.1)"
                    : "rgba(239, 68, 68, 0.1)",
                color:
                  sub.status === "active" ? "var(--a-ok)" : "var(--a-crit)",
              }}
            >
              {sub.status === "active" ? "Actief" : sub.status}
            </span>
          </div>

          <div className="text-xs" style={{ color: "var(--a-mute)" }}>
            <p>Volgende facturering: {sub.nextBillingAt.toLocaleDateString("nl-NL")}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handlePause(sub.id)}
              disabled={busy === sub.id || sub.status !== "active"}
              className="rounded border px-3 py-1 text-xs hover:bg-gray-100 disabled:opacity-50"
              style={{ borderColor: "var(--a-border)", color: "var(--a-text)" }}
            >
              Pauzeren
            </button>
            <button
              onClick={() => handleCancel(sub.id)}
              disabled={busy === sub.id}
              className="rounded border px-3 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
              style={{ borderColor: "var(--a-border)" }}
            >
              Opzeggen
            </button>
          </div>

          {sub.cancelAtPeriodEnd && (
            <p className="text-xs" style={{ color: "var(--a-warn)" }}>
              ⚠ Dit abonnement wordt opgezegd na {sub.currentPeriodEnd.toLocaleDateString("nl-NL")}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
