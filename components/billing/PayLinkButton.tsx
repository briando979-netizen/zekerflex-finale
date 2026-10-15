"use client";

import { useState } from "react";

export function PayLinkButton({ token, label }: { token: string; label: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/betaal/${token}`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) throw new Error(data?.error?.message ?? "Betalen lukte niet — probeer het opnieuw.");
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Betalen lukte niet — probeer het opnieuw.");
      setBusy(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={pay} disabled={busy} className="btn-primary w-full py-3 text-base disabled:opacity-60">
        {busy ? "Even geduld…" : label}
      </button>
      {error && <p className="mt-2 text-sm text-crit">{error}</p>}
    </div>
  );
}
