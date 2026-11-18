"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// De knop op Beheer, Sales, Partnercampagnes: maakt de ontbrekende campagnes aan als concept (lib/sales/partner-campagnes.ts).

export function PartnerCampagnesKnop({ allemaalAanwezig }: { allemaalAanwezig: boolean }) {
  const router = useRouter();
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [bericht, setBericht] = useState<string | null>(null);

  async function maak() {
    setBezig(true);
    setFout(null);
    setBericht(null);
    try {
      const res = await fetch("/api/admin/sales/partner-campagnes", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { aangemaakt?: string[]; bestond?: string[]; error?: { message?: string } };
      if (!res.ok) {
        setFout(data.error?.message ?? "Aanmaken is niet gelukt.");
        return;
      }
      const nieuw = data.aangemaakt?.length ?? 0;
      setBericht(nieuw > 0 ? `${nieuw} campagne${nieuw === 1 ? "" : "s"} aangemaakt als concept.` : "Alle campagnes bestonden al.");
      router.refresh();
    } catch {
      setFout("Aanmaken is niet gelukt. Probeer het zo opnieuw.");
    } finally {
      setBezig(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => void maak()}
        disabled={bezig || allemaalAanwezig}
        className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60"
        style={{ background: "var(--a-text)", color: "var(--a-panel)" }}
      >
        {bezig ? "Aanmaken…" : allemaalAanwezig ? "Alle campagnes staan er al" : "Maak de partnercampagnes aan"}
      </button>
      {fout && (
        <p role="alert" className="text-sm font-medium" style={{ color: "var(--a-bad, #b91c1c)" }}>
          {fout}
        </p>
      )}
      {bericht && (
        <p role="status" className="text-sm font-medium" style={{ color: "var(--a-ok)" }}>
          {bericht}
        </p>
      )}
    </div>
  );
}
