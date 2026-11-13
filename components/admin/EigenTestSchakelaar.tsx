"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Beheer → Bedrijf of Gebruiker: "Eigen test (telt niet mee)" (POST /api/admin/eigen-test, lib/admin/eigen-test.ts).
 * Een eigen test telt niet mee in de trechters en de analyse; bij een bedrijf gelden de klussen die daarna worden
 * aangemaakt als testklus. De stand komt na het opslaan van de server (sinds), niet uit de klik zelf.
 */
export function EigenTestSchakelaar({ soort, id, sinds: beginSinds }: { soort: "tenant" | "user"; id: string; sinds: string | null }) {
  const router = useRouter();
  const [sinds, setSinds] = useState<string | null>(beginSinds);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const aan = sinds !== null;

  async function schakel() {
    setBezig(true);
    setFout(null);
    const r = await fetch("/api/admin/eigen-test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ soort, id, aan: !aan }),
    }).catch(() => null);
    const d = (await r?.json().catch(() => null)) as { sinds?: string | null; error?: { message?: string } } | null;
    if (r?.ok && d) {
      setSinds(d.sinds ?? null);
      router.refresh();
    } else {
      setFout(d?.error?.message ?? "Opslaan lukte niet. Probeer het opnieuw.");
    }
    setBezig(false);
  }

  const datum = sinds ? new Date(sinds).toLocaleDateString("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "long", year: "numeric" }) : null;
  return (
    <div className="mt-2 text-xs" style={{ color: "var(--a-text)" }}>
      <label className="inline-flex cursor-pointer items-center gap-2">
        <input type="checkbox" checked={aan} disabled={bezig} onChange={() => void schakel()} />
        <span className="font-medium">Eigen test (telt niet mee)</span>
      </label>
      <p className="mt-1" style={{ color: "var(--a-mute)" }}>
        {aan
          ? `Sinds ${datum}: telt niet mee in de trechters en de analyse${soort === "tenant" ? "; klussen die dit bedrijf vanaf dan plaatst, gelden als testklus (alleen voor interne accounts, niet naar Google of Indeed)" : ""}.`
          : soort === "tenant"
            ? "Uit: dit bedrijf telt mee, en zijn klussen zijn gewone klussen."
            : "Uit: dit account telt mee."}
      </p>
      {fout && (
        <p role="alert" className="mt-1" style={{ color: "var(--a-crit, #b42318)" }}>
          {fout}
        </p>
      )}
    </div>
  );
}
