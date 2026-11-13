"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Beheer -> AI-trader: de Alpaca-papier-sleutel invullen. Het geheim gaat één keer naar de server en komt nooit terug;
// na het bewaren wordt het veld leeggemaakt.
export function AiTraderSleutel({ aanwezig, ingesteldOp }: { aanwezig: boolean; ingesteldOp: string | null }) {
  const router = useRouter();
  const [keyId, setKeyId] = useState("");
  const [secret, setSecret] = useState("");
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<{ tekst: string; fout: boolean } | null>(null);

  const bewaar = async () => {
    setBezig(true);
    setMelding(null);
    try {
      const r = await fetch("/api/admin/ai-trader", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keyId, secret }) });
      const d = (await r.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!r.ok) {
        setMelding({ tekst: d?.error?.message ?? "Bewaren mislukt.", fout: true });
        return;
      }
      setKeyId("");
      setSecret("");
      setMelding({ tekst: "Sleutel gecontroleerd en bewaard.", fout: false });
      router.refresh();
    } catch {
      setMelding({ tekst: "Geen verbinding.", fout: true });
    } finally {
      setBezig(false);
    }
  };

  const verwijder = async () => {
    setBezig(true);
    setMelding(null);
    try {
      const r = await fetch("/api/admin/ai-trader", { method: "DELETE" });
      if (!r.ok) {
        setMelding({ tekst: "Verwijderen mislukt.", fout: true });
        return;
      }
      setMelding({ tekst: "Sleutel verwijderd.", fout: false });
      router.refresh();
    } catch {
      setMelding({ tekst: "Geen verbinding.", fout: true });
    } finally {
      setBezig(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm" style={{ color: "var(--a-dim)" }}>
        {aanwezig ? `Er is een papier-sleutel bewaard${ingesteldOp ? ` (ingesteld op ${ingesteldOp})` : ""}. Je ziet hem nooit terug; plak hieronder een nieuwe om hem te vervangen.` : "Er is nog geen sleutel ingevuld. Maak een papier-sleutel aan op app.alpaca.markets (kies Paper) en plak hem hier."}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="a-label">Sleutel-id (begint met PK)
          <input className="a-input" value={keyId} onChange={(e) => setKeyId(e.target.value)} autoComplete="off" spellCheck={false} />
        </label>
        <label className="a-label">Geheim
          <input className="a-input" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="new-password" spellCheck={false} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="a-button a-button-primary text-sm" disabled={bezig || !keyId || !secret} onClick={() => void bewaar()}>Controleren en bewaren</button>
        {aanwezig ? <button type="button" className="a-button text-sm" disabled={bezig} onClick={() => void verwijder()}>Sleutel verwijderen</button> : null}
        {melding ? <span role={melding.fout ? "alert" : "status"} className="text-xs" style={{ color: melding.fout ? "var(--a-crit)" : "var(--a-mute)" }}>{melding.tekst}</span> : null}
      </div>
    </div>
  );
}