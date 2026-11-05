"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Admin → Beveiliging: de blokkade van één adres opheffen (DELETE /api/admin/beveiliging/crowdsec). */
export function DeblokkeerKnop({ ip }: { ip: string }) {
  const router = useRouter();
  const [staat, setStaat] = useState<"klaar-om" | "bezig" | "opgeheven" | "mislukt">("klaar-om");

  async function klik() {
    setStaat("bezig");
    const r = await fetch("/api/admin/beveiliging/crowdsec", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ip }),
    }).catch(() => null);
    if (r?.ok) {
      setStaat("opgeheven");
      router.refresh();
    } else {
      setStaat("mislukt");
    }
  }

  return (
    <button
      type="button"
      onClick={() => void klik()}
      disabled={staat === "bezig" || staat === "opgeheven"}
      className="btn-ghost text-xs disabled:opacity-60"
      aria-live="polite"
    >
      {staat === "bezig" ? "Bezig…" : staat === "opgeheven" ? "Opgeheven" : staat === "mislukt" ? "Mislukt, probeer opnieuw" : "Blokkade opheffen"}
    </button>
  );
}
