"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Admin → Verkoop via AI: de productlijst nu naar Stripe sturen (POST /api/admin/verkoop-via-ai). */
export function AgentCatalogusKnop() {
  const router = useRouter();
  const [staat, setStaat] = useState<"klaar-om" | "bezig" | "verstuurd" | "mislukt">("klaar-om");
  const [melding, setMelding] = useState("");

  async function klik() {
    setStaat("bezig");
    setMelding("");
    const r = await fetch("/api/admin/verkoop-via-ai", { method: "POST" }).catch(() => null);
    const j = (await r?.json().catch(() => null)) as { uitslag?: string; stand?: { fout?: { bericht?: string } } } | null;
    if (r?.ok && j?.uitslag !== "fout") {
      setStaat("verstuurd");
      setMelding(j?.uitslag === "uit" ? "Staat uit in Systeem → Vlaggen (Webshop via AI-assistenten)." : j?.uitslag === "geen-sleutel" ? "Er staat geen Stripe-sleutel op de server." : "");
    } else {
      setStaat("mislukt");
      setMelding(j?.stand?.fout?.bericht ?? "Het lukte niet; kijk hieronder bij de laatste fout.");
    }
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={() => void klik()} disabled={staat === "bezig"} className="btn-primary text-sm disabled:opacity-60">
        {staat === "bezig" ? "Bezig met versturen…" : "Productlijst nu naar Stripe sturen"}
      </button>
      <span aria-live="polite" role={staat === "mislukt" ? "alert" : undefined} className={`text-sm ${staat === "mislukt" ? "text-crit" : "text-neutralx-600"}`}>
        {staat === "verstuurd" ? melding || "Verstuurd. Stripe verwerkt het binnen een paar minuten." : staat === "mislukt" ? melding : ""}
      </span>
    </div>
  );
}
