"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Beheer → Gebruiker → Identiteitscontroles: de foto's en gegevens van Stripe-controles naar ZekerFlex kopiëren
 * (POST /api/admin/kyc/stripe-kopie, lib/kyc/stripe-kopie.ts). Voor deze gebruiker, of voor iedereen. Een tweede keer kopieert
 * niets dubbel. De uitkomst komt van de server (aantallen en redenen in gewone taal).
 */
export function StripeKopieKnop({ userId }: { userId: string }) {
  const router = useRouter();
  const [bezig, setBezig] = useState<"een" | "alles" | null>(null);
  const [uitslag, setUitslag] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  async function kopieer(wie: "een" | "alles") {
    if (wie === "alles" && !window.confirm("De foto's en gegevens van alle Stripe-controles naar ZekerFlex kopiëren? Dat kan een minuut duren.")) return;
    setBezig(wie);
    setFout(null);
    setUitslag(null);
    try {
      const res = await fetch("/api/admin/kyc/stripe-kopie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(wie === "een" ? { userId } : {}),
      });
      const d = (await res.json().catch(() => ({}))) as { controles?: number; fotos?: number; overgeslagen?: number; redenen?: string[]; error?: { message?: string } };
      if (!res.ok) {
        setFout(d.error?.message ?? `Dat lukte niet (code ${res.status}). Probeer het opnieuw.`);
        return;
      }
      const redenen = d.redenen?.length ? ` Niet alles: ${d.redenen.join(" ")}` : "";
      setUitslag(`${d.controles ?? 0} ${d.controles === 1 ? "controle" : "controles"}, ${d.fotos ?? 0} foto's gekopieerd${d.overgeslagen ? `, ${d.overgeslagen} waren er al` : ""}.${redenen}`);
      router.refresh();
    } catch {
      setFout("Geen verbinding. Probeer het opnieuw.");
    } finally {
      setBezig(null);
    }
  }

  return (
    <div className="mt-2 space-y-1.5 text-xs">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void kopieer("een")} disabled={bezig !== null} className="a-btn text-xs disabled:opacity-60">
          {bezig === "een" ? "Bezig…" : "Kopieer uit Stripe"}
        </button>
        <button type="button" onClick={() => void kopieer("alles")} disabled={bezig !== null} className="a-btn text-xs disabled:opacity-60">
          {bezig === "alles" ? "Bezig…" : "Kopieer alles uit Stripe"}
        </button>
      </div>
      {uitslag && (
        <p role="status" style={{ color: "var(--a-dim)" }}>
          {uitslag}
        </p>
      )}
      {fout && (
        <p role="alert" style={{ color: "var(--a-crit)" }}>
          {fout}
        </p>
      )}
    </div>
  );
}
