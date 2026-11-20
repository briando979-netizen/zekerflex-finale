"use client";

import { useState } from "react";
import { useT } from "@/components/i18n/I18nProvider";

// "Link kopiëren" van een klus (naar YoungOnes): de openbare kluspagina (/klussen/<id>) naar het klembord, om te delen
// met een kracht buiten het platform (WhatsApp, mail). Geen capability-URL: gewoon de pagina die iedereen mag zien.
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
  return (
    <button type="button" onClick={() => void kopieer()} className="btn-ghost text-sm" aria-live="polite">
      {stand === "ok" ? c.copied : stand === "fout" ? c.copyFailed : c.copyLink}
    </button>
  );
}
