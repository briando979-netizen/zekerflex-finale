"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const LABEL: Record<string, string> = {
  VERIFIED: "goedgekeurd",
  REJECTED: "afgewezen",
  PENDING: "in behandeling",
  NOT_STARTED: "niet gestart",
  EXPIRED: "verlopen",
};

/** Admin: set a user's identity status by hand, with or without a submitted check. */
export function KycOverride({ userId, status }: { userId: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "approve" | "reject" | "reset") {
    const ask =
      decision === "approve"
        ? "Identiteit handmatig goedkeuren? Doe dit alleen als je zeker weet wie dit is."
        : decision === "reject"
          ? "Identiteit afwijzen? De gebruiker kan dan niet op klussen reageren."
          : "Verificatie terugzetten naar 'niet gestart'? De gebruiker moet dan opnieuw verifiëren.";
    const reason = window.prompt(`${ask}\n\nReden (optioneel, komt in het auditspoor):`, "");
    if (reason === null) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/gebruikers/${userId}/kyc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, ...(reason.trim() ? { reason: reason.trim() } : {}) }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d?.error?.message ?? "Opslaan mislukt.");
      } else router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 px-5 py-3 text-sm">
      <span className="text-neutralx-600">
        Status nu: <strong className="text-ink">{LABEL[status] ?? status}</strong>
      </span>
      <div className="ml-auto flex flex-wrap gap-2">
        {status !== "VERIFIED" && (
          <button type="button" disabled={busy} onClick={() => void decide("approve")} className="btn-ghost text-xs text-ok disabled:opacity-50">
            Handmatig goedkeuren
          </button>
        )}
        {status !== "REJECTED" && (
          <button type="button" disabled={busy} onClick={() => void decide("reject")} className="btn-ghost text-xs text-crit disabled:opacity-50">
            Afwijzen
          </button>
        )}
        {status !== "NOT_STARTED" && (
          <button type="button" disabled={busy} onClick={() => void decide("reset")} className="btn-ghost text-xs text-neutralx-500 disabled:opacity-50">
            Terugzetten
          </button>
        )}
      </div>
      {error && <p className="w-full text-xs text-crit">{error}</p>}
    </div>
  );
}
