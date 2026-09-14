"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ComplianceDocActions({ userId, docId }: { userId: string; docId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function decide(decision: "approve" | "reject") {
    if (decision === "reject" && !window.confirm("Dit document afwijzen?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/gebruikers/${userId}/documents/${docId}`, {
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
