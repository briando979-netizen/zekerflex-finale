"use client";

import { useEffect, useState, useTransition } from "react";
import { useFT } from "@/components/i18n/useFT";

type Status = { connected: boolean; payoutsEnabled: boolean };

// Uitbetalen via Stripe Connect koppelen (/dashboard/profiel). Vijf talen (lib/i18n/freelancer.ts, stripeConnect). Staat
// betalen bij het live Stripe-account uit (lib/billing/stripe-betalen.ts), dan geen knop maar "tijdelijk uit": een nieuw
// account maken lukt dan toch niet (12 nov: een werker kreeg een kale 500).
export function StripeConnectPayout({
  initialConnected,
  initialPayoutsEnabled,
  tijdelijkUit = false,
}: {
  initialConnected: boolean;
  initialPayoutsEnabled: boolean;
  tijdelijkUit?: boolean;
}) {
  const t = useFT().stripeConnect;
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
        if (!res.ok || !data.url) throw new Error(data?.error?.message ?? t.mislukt);
        window.location.href = data.url;
      } catch (err) {
        setError(err instanceof Error ? err.message : t.mislukt);
      }
    });

  if (status.payoutsEnabled) {
    return (
      <div className="flex items-center justify-between gap-3 px-5 py-3.5 text-sm">
        <span className="flex items-center gap-2 text-ok">
          <span aria-hidden>✅</span> {t.actief}
        </span>
        <button type="button" onClick={go} disabled={pending} className="text-xs font-semibold text-brand-600 underline">
          {pending ? t.bezig : t.beheer}
        </button>
      </div>
    );
  }

  if (tijdelijkUit) {
    return (
      <div className="px-5 py-3.5">
        <p className="text-sm text-neutralx-600">{status.connected ? t.nietAf : t.nietGekoppeld}</p>
        <p className="mt-1.5 text-xs leading-relaxed text-neutralx-500">{t.tijdelijkUit}</p>
      </div>
    );
  }

  return (
    <div className="px-5 py-3.5">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-neutralx-600">
          {status.connected ? t.nietAf : t.nietGekoppeld}
        </span>
        <button type="button" onClick={go} disabled={pending} className="btn-primary px-3 py-1.5 text-xs">
          {pending ? t.bezig : status.connected ? t.afronden : t.koppel}
        </button>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-neutralx-500">{t.uitleg}</p>
      {error && <p role="alert" className="mt-1.5 text-xs text-crit">{error}</p>}
    </div>
  );
}
