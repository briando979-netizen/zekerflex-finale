"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Knoppen op Admin → Systeem → Back-ups: meteen een back-up maken of de
// diepgaande hersteltest starten. Dezelfde vaste onderhoudstaken als in Live
// zetten → Serveronderhoud; de live-zetter op de server voert ze uit
// (deploy/bouwer/zf-live.py) en de back-updienst doet het werk.

type Taak = "backup-nu" | "backup-verifieer";

export function BackupActies({ agentLeeft }: { agentLeeft: boolean }) {
  const router = useRouter();
  const [bezig, setBezig] = useState<Taak | null>(null);
  const [melding, setMelding] = useState<{ tekst: string; fout: boolean } | null>(null);

  async function start(taak: Taak) {
    setBezig(taak);
    setMelding(null);
    try {
      const r = await fetch("/api/admin/bouwer/live", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actie: "onderhoud", taak }) });
      const d = (await r.json().catch(() => ({}))) as { error?: { message?: string } };
      if (!r.ok) throw new Error(d.error?.message ?? "Dat lukte niet.");
      setMelding({
        tekst: taak === "backup-nu" ? "De server maakt nu een back-up (een paar minuten). Vernieuw deze pagina daarna; het verloop staat in Live zetten → Serveronderhoud." : "De hersteltest is gestart (enkele minuten). Vernieuw deze pagina daarna; het verloop staat in Live zetten → Serveronderhoud.",
        fout: false,
      });
      window.setTimeout(() => router.refresh(), 90_000);
    } catch (e) {
      setMelding({ tekst: e instanceof Error ? e.message : "Dat lukte niet.", fout: true });
    } finally {
      setBezig(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className="a-btn" disabled={!agentLeeft || bezig !== null} onClick={() => void start("backup-verifieer")}>
        {bezig === "backup-verifieer" ? "Starten…" : "Hersteltest nu"}
      </button>
      <button type="button" className="a-btn a-btn-ghost" disabled={!agentLeeft || bezig !== null} onClick={() => void start("backup-nu")}>
        {bezig === "backup-nu" ? "Starten…" : "Back-up nu"}
      </button>
      {!agentLeeft && (
        <span className="text-xs" style={{ color: "var(--a-mute)" }}>
          De live-zetter op de server reageert niet; de knoppen werken dan niet.
        </span>
      )}
      {melding && (
        <p role={melding.fout ? "alert" : "status"} className="basis-full text-xs" style={{ color: melding.fout ? "var(--a-crit)" : "var(--a-mute)" }}>
          {melding.tekst}
        </p>
      )}
    </div>
  );
}
