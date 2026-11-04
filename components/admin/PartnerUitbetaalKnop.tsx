"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Beheer → Partnerprogramma: "Uitbetaald" voor één bedrijf, nadat het bedrag is overgemaakt.

export function PartnerUitbetaalKnop({ tenantId, bedrag }: { tenantId: string; bedrag: string }) {
  const router = useRouter();
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");

  const klik = async () => {
    if (!window.confirm(`Heb je ${bedrag} overgemaakt? Dan markeren we deze vergoedingen als uitbetaald.`)) return;
    setBezig(true);
    setFout("");
    try {
      const res = await fetch("/api/admin/shop-partners", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenantId }) });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setFout(data?.error?.message ?? "Niet gelukt.");
        return;
      }
      router.refresh();
    } catch {
      setFout("Geen verbinding.");
    } finally {
      setBezig(false);
    }
  };

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button type="button" onClick={klik} disabled={bezig} className="a-btn a-btn-primary text-xs">
        {bezig ? "Bezig…" : "Uitbetaald"}
      </button>
      {fout && (
        <span role="alert" className="text-xs" style={{ color: "var(--a-crit)" }}>
          {fout}
        </span>
      )}
    </span>
  );
}
