"use client";

import { useEffect, useState, useTransition } from "react";

type Status = { connected: boolean; payoutsEnabled: boolean };

export function StripeConnectPayout({
  initialConnected,
  initialPayoutsEnabled,
}: {
  initialConnected: boolean;
  initialPayoutsEnabled: boolean;
}) {
  const [status, setStatus] = useState<Status>({
    connected: initialConnected,
    payoutsEnabled: initialPayoutsEnabled,
  });
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Coming back from Stripe onboarding: re-check status instead of trusting
  // the redirect (async verification can lag the return_url).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.location.search.includes("stripe=")) return;
    fetch("/api/me/payout/stripe-connect")
      .then((r) => r.json())
      .then((d) => setStatus({ connected: Boolean(d.connected), payoutsEnabled: Boolean(d.payoutsEnabled) }))
      .catch(() => {});
  }, []);

  const go = () =>
    start(async () => {
      setError(null);
      try {
        const res = await fetch("/api/me/payout/stripe-connect", { method: "POST" });
        const data = await res.json();
        if (!res.ok || !data.url) throw new Error(data?.error?.message ?? "Kon Stripe niet openen");
        window.location.href = data.url;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Kon Stripe niet openen");
      }
    });

  if (status.payoutsEnabled) {
    return (
      <div className="flex items-center justify-between gap-3 px-5 py-3.5 text-sm">
        <span className="flex items-center gap-2 text-ok">
          <span aria-hidden>✅</span> Gekoppeld via Stripe — uitbetalingen actief
        </span>
        <button type="button" onClick={go} disabled={pending} className="text-xs font-semibold text-brand-600 underline">
          {pending ? "Bezig…" : "Beheer in Stripe"}
        </button>
      </div>
    );
  }

  return (
    <div className="px-5 py-3.5">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-neutralx-600">
          {status.connected ? "Onboarding nog niet afgerond" : "Nog niet gekoppeld"}
        </span>
        <button type="button" onClick={go} disabled={pending} className="btn-primary px-3 py-1.5 text-xs">
          {pending ? "Bezig…" : status.connected ? "Onboarding afronden" : "Koppel je bankrekening"}
        </button>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-neutralx-500">
        Via Stripe, veilig en binnen enkele minuten — nodig voor snelle uitbetaling na goedkeuring van je uren.
      </p>
      {error && <p className="mt-1.5 text-xs text-crit">{error}</p>}
    </div>
  );
}
