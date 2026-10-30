"use client";

import Link from "next/link";
import { useState } from "react";
import { SAAS_PLANS, SAAS_PLAN_KEYS } from "@/lib/billing/saas-plans";

const euro = (c: number) => `€ ${(c / 100).toFixed(0)}`;

export function SaasPlans() {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function subscribe(planKey: string) {
    setBusy(planKey);
    setMsg(null);
    try {
      const res = await fetch("/api/werkgever/saas-subscription/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planKey }),
      });
      const d = (await res.json().catch(() => ({}))) as { url?: string; error?: { message?: string } };
      if (res.ok && d.url) {
        window.location.href = d.url;
        return;
      }
      if (res.status === 401) setMsg("Log eerst in als werkgever om een abonnement te starten.");
      else setMsg(d.error?.message ?? "Abonneren lukte niet. Probeer het later opnieuw.");
    } catch {
      setMsg("Netwerkfout. Probeer het later opnieuw.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {SAAS_PLAN_KEYS.map((key) => {
          const p = SAAS_PLANS[key];
          const featured = key === "pro";
          return (
            <div key={key} className={`flex flex-col rounded-2xl border bg-white p-6 ${featured ? "border-brand-500 shadow-card" : "border-hair"}`}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-xl font-bold text-ink">{p.label}</h3>
                {featured && <span className="rounded-full bg-brand-500 px-2 py-0.5 text-[11px] font-semibold text-white">Populair</span>}
              </div>
              <p className="mt-1 text-sm text-neutralx-600">{p.tagline}</p>
              <p className="mt-4 font-display text-2xl font-bold text-ink">
                {p.priceCentsPerMonth === null ? "Op aanvraag" : p.priceCentsPerMonth === 0 ? "Gratis" : <>{euro(p.priceCentsPerMonth)}<span className="text-sm font-normal text-neutralx-500"> /mnd</span></>}
              </p>
              <ul className="mt-4 flex-1 space-y-2 text-sm text-neutralx-700">
                {p.features.map((f, i) => (
                  <li key={i} className="flex gap-2"><span className="mt-0.5 flex-shrink-0 text-brand-500" aria-hidden>✓</span><span>{f}</span></li>
                ))}
              </ul>
              {key === "starter" ? (
                <Link href="/register" className="btn-primary mt-6 text-center text-sm">Gratis starten</Link>
              ) : key === "enterprise" ? (
                <a href="mailto:sales@zekerflex.com?subject=ZekerFlex%20Enterprise" className="btn-ghost mt-6 border border-hairstrong text-center text-sm">Neem contact op</a>
              ) : (
                <button type="button" onClick={() => void subscribe(key)} disabled={busy === key} className={`mt-6 rounded-full px-5 py-2.5 text-center text-sm font-semibold ${featured ? "btn-primary" : "btn-ghost border border-hairstrong"} disabled:opacity-50`}>
                  {busy === key ? "Bezig…" : "Abonneer"}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {msg && <p className="mt-4 text-sm text-crit" role="alert">{msg}</p>}
      <p className="mt-6 text-xs text-neutralx-400">Prijzen excl. btw. De €3,50/uur platformfee geldt los van het abonnement, alleen bij daadwerkelijk gewerkte uren.</p>
    </div>
  );
}
