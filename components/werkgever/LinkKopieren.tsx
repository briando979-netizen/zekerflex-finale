"use client";

import { useState } from "react";
import { useT } from "@/components/i18n/I18nProvider";
import { Ketting } from "@/components/werkgever/iconen";

// "Link kopiëren" van een klus (naar YoungOnes): de openbare kluspagina (/klussen/<id>) naar het klembord, om te delen
// met een kracht buiten het platform (WhatsApp, mail). Geen capability-URL: gewoon de pagina die iedereen mag zien.
// Op een telefoon is het een vierkante knop met alleen het icoon (de tekst blijft er voor een schermlezer).
export function LinkKopieren({ shiftId }: { shiftId: string }) {
  const c = useT().controls;
  const [stand, setStand] = useState<"idle" | "ok" | "fout">("idle");
  const kopieer = async () => {
    const url = `${window.location.origin}/klussen/${encodeURIComponent(shiftId)}`;
    try {
      await navigator.clipboard.writeText(url);
      setStand("ok");
    } catch {
      setStand("fout");
    }
    window.setTimeout(() => setStand("idle"), 2500);
  };
  const tekst = stand === "ok" ? c.copied : stand === "fout" ? c.copyFailed : c.copyLink;
  return (
    <button type="button" onClick={() => void kopieer()} className="btn-ghost relative min-h-11 gap-2 rounded-lg px-3 text-sm sm:px-4" aria-live="polite">
      <span className={stand === "idle" ? "sr-only sm:not-sr-only" : ""}>{tekst}</span>
      <Ketting maat={18} />
    </button>
  );
}
