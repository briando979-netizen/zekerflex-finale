"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function IdentityCheckActions({ userId, checkId }: { userId: string; checkId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function decide(decision: "approve" | "reject") {
    if (decision === "reject" && !window.confirm("Deze identiteitscontrole afwijzen?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/gebruikers/${userId}/identiteit/${checkId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => void decide("approve")}
        disabled={busy}
        className="btn-ghost text-xs text-ok disabled:opacity-50"
      >
        Goedkeuren
      </button>
      <button
        type="button"
        onClick={() => void decide("reject")}
        disabled={busy}
        className="btn-ghost text-xs text-crit disabled:opacity-50"
      >
        Afwijzen
      </button>
    </div>
  );
}
