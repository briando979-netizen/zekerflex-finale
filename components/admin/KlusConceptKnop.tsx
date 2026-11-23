"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * De handrem van Beheer (Admin → Bedrijven → een bedrijf → Klussen): een klus waar nog niemand op staat met één klik naar
 * concept, zodat werkers hem niet meer zien, en weer live. De regels staan op de server (api/admin/bedrijven/[id]/klussen/[shiftId]).
 */
export function KlusConceptKnop({ tenantId, shiftId, naar }: { tenantId: string; shiftId: string; naar: "concept" | "live" }) {
  const router = useRouter();
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function zet() {
    if (naar === "concept" && !window.confirm("Deze klus naar concept zetten? Werkers zien hem dan niet meer. Je kunt hem straks weer live zetten.")) return;
    setBezig(true);
    setFout(null);
    try {
      const res = await fetch(`/api/admin/bedrijven/${tenantId}/klussen/${shiftId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ naar }),
      });
      if (res.ok) {
        router.refresh();
        return;
      }
      const d = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      setFout(d.error?.message ?? "Dat lukte niet.");
    } finally {
      setBezig(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button type="button" onClick={zet} disabled={bezig} className="a-button text-xs">
        {bezig ? "Bezig…" : naar === "concept" ? "Naar concept" : "Weer live"}
      </button>
      {fout && (
        <span role="alert" className="text-xs" style={{ color: "var(--a-crit)" }}>
          {fout}
        </span>
      )}
    </span>
  );
}
