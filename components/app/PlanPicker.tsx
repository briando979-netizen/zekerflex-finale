"use client";

import { useState } from "react";
import { API_PLANS, PLAN_KEYS, type PlanKey } from "@/lib/api-plans/catalog";

const euro = (cents: number) => `€ ${(cents / 100).toFixed(0)}`;

export function PlanPicker({
  currentPlanKey,
  hasOrganization,
}: {
  currentPlanKey: PlanKey;
  hasOrganization: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function upgrade(planKey: PlanKey) {
    setBusy(planKey);
    setErr(null);
    try {
      const res = await fetch("/api/werkgever/subscription/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planKey }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message ?? "Starten van Checkout mislukt");
      window.location.href = data.url;
    } catch (e) {
      setErr((e as Error).message);
      setBusy(null);
    }
  }

  async function manage() {
    setBusy("portal");
    setErr(null);
    try {
      const res = await fetch("/api/werkgever/subscription/portal", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message ?? "Openen van beheerpagina mislukt");
      window.location.href = data.url;
    } catch (e) {
      setErr((e as Error).message);
      setBusy(null);
    }
  }

  if (!hasOrganization) {
    return <p className="text-sm text-neutralx-500">Koppel eerst een organisatie aan je account om een abonnement te kiezen.</p>;
  }

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PLAN_KEYS.map((key) => {
          const plan = API_PLANS[key];
          const isCurrent = key === currentPlanKey;
          return (
            <div
              key={key}
              className={`rounded-xl border p-4 ${isCurrent ? "border-brand-500 bg-brand-50" : "border-hairstrong bg-white"}`}
            >
              <p className="font-display text-base font-bold text-ink">{plan.label}</p>
              <p className="mt-1 text-2xl font-bold text-ink">
                {plan.priceCentsPerMonth === null ? "Op aanvraag" : plan.priceCentsPerMonth === 0 ? "Gratis" : `${euro(plan.priceCentsPerMonth)}/mnd`}
              </p>
              <ul className="mt-3 space-y-1 text-xs text-neutralx-600">
                <li>{plan.rateLimitPerMinute}/min</li>
                <li>{plan.monthlyRequestCap ? `${plan.monthlyRequestCap.toLocaleString("nl-NL")}/maand` : "Op maat"}</li>
                <li>{plan.scopes.length} scopes</li>
              </ul>
              {isCurrent ? (
                <span className="mt-4 block rounded-lg bg-brand-500 px-3 py-1.5 text-center text-xs font-semibold text-white">
                  Huidig abonnement
                </span>
              ) : plan.selfService ? (
                <button
                  type="button"
                  onClick={() => upgrade(key)}
                  disabled={busy === key}
                  className="btn-primary mt-4 w-full text-xs disabled:opacity-50"
                >
                  {busy === key ? "Bezig…" : "Kiezen"}
                </button>
              ) : (
                <a href="mailto:sales@zekerflex.com" className="btn-ghost mt-4 block w-full text-center text-xs">
                  Contact sales
                </a>
              )}
            </div>
          );
        })}
      </div>
      {err && <p className="mt-3 text-sm text-crit">{err}</p>}
      {currentPlanKey !== "free" && (
        <button type="button" onClick={manage} disabled={busy === "portal"} className="btn-ghost mt-4 text-xs disabled:opacity-50">
          {busy === "portal" ? "Bezig…" : "Abonnement beheren / opzeggen"}
        </button>
      )}
    </div>
  );
}
