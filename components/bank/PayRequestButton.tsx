"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function PayRequestButton({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/me/bank/requests/${id}/pay`, { method: "POST" }).catch(() => null);
    const d = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) {
      setError(d?.error?.message ?? "Betalen lukte niet — probeer het opnieuw.");
      setBusy(false);
      return;
    }
    router.refresh();
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
