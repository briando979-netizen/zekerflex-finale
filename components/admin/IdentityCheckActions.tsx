"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Goedkeuren of afwijzen van een identiteitscontrole; een fout staat in beeld (vroeger gebeurde er dan stil niets). */
export function IdentityCheckActions({ userId, checkId }: { userId: string; checkId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [klaar, setKlaar] = useState<string | null>(null);

  async function decide(decision: "approve" | "reject") {
    if (decision === "reject" && !window.confirm("Deze identiteitscontrole afwijzen?")) return;
    setBusy(true);
    setFout(null);
    try {
      const res = await fetch(`/api/admin/gebruikers/${userId}/identiteit/${checkId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: { message?: string }; message?: string };
        setFout(d.error?.message ?? d.message ?? `Dat lukte niet (code ${res.status}). Probeer het opnieuw.`);
        return;
      }
      setKlaar(decision === "approve" ? "Goedgekeurd. De werker krijgt een bericht." : "Afgewezen.");
      router.refresh();
    } catch {
      setFout("Geen verbinding. Probeer het opnieuw.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void decide("approve")} disabled={busy} className="a-btn a-btn-primary text-xs disabled:opacity-50">
          {busy ? "Bezig…" : "Goedkeuren"}
        </button>
        <button type="button" onClick={() => void decide("reject")} disabled={busy} className="a-btn text-xs disabled:opacity-50" style={{ color: "var(--a-crit, #f87171)" }}>
          Afwijzen
        </button>
      </div>
      {fout && (
        <p role="alert" className="mt-2 text-xs" style={{ color: "var(--a-crit, #f87171)" }}>
          {fout}
        </p>
      )}
      {klaar && (
        <p role="status" className="mt-2 text-xs" style={{ color: "var(--a-ok, #4ade80)" }}>
          {klaar}
        </p>
      )}
    </div>
  );
}
