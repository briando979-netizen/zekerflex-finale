"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const KNOP = "rounded-md px-2.5 py-1 text-xs font-medium transition disabled:opacity-50";

/** De knoppen Proef en Echt van het paneel "Postbus info@ afhandelen" (components/admin/InfoMailPanel.tsx). */
export function InfoMailKnoppen({ echt }: { echt: boolean }) {
  const router = useRouter();
  const [bezig, setBezig] = useState(false);
  const [zeker, setZeker] = useState(false);
  const [fout, setFout] = useState("");

  async function zet(stand: "proef" | "echt") {
    setBezig(true);
    setFout("");
    try {
      const res = await fetch("/api/admin/mail/info", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stand }) });
      if (!res.ok) throw new Error();
      setZeker(false);
      router.refresh();
    } catch {
      setFout("Wisselen lukte niet. Probeer het opnieuw.");
    } finally {
      setBezig(false);
    }
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      {zeker ? (
        <>
          <span className="text-xs" style={{ color: "var(--a-text)" }}>
            Vanaf nu echt verplaatsen en antwoorden?
          </span>
          <button type="button" disabled={bezig} onClick={() => void zet("echt")} className={KNOP} style={{ color: "var(--a-panel)", background: "var(--a-text)" }}>
            Ja, zet echt aan
          </button>
          <button type="button" disabled={bezig} onClick={() => setZeker(false)} className={KNOP} style={{ color: "var(--a-text)", border: "1px solid var(--a-border-strong)" }}>
            Nee
          </button>
        </>
      ) : (
        <>
          <button type="button" disabled={bezig || !echt} aria-pressed={!echt} onClick={() => void zet("proef")} className={KNOP} style={{ color: "var(--a-text)", border: "1px solid var(--a-border-strong)" }}>
            Proef
          </button>
          <button type="button" disabled={bezig || echt} aria-pressed={echt} onClick={() => setZeker(true)} className={KNOP} style={{ color: "var(--a-text)", border: "1px solid var(--a-border-strong)" }}>
            Echt
          </button>
        </>
      )}
      {fout ? (
        <span role="alert" className="text-xs" style={{ color: "var(--a-text)" }}>
          {fout}
        </span>
      ) : null}
    </span>
  );
}
