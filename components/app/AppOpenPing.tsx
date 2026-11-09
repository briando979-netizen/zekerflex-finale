"use client";

import { useEffect } from "react";
import { appOpenTelt } from "@/lib/engagement/app-open";

const KEY = "zf:app-open";

/**
 * Meldt "app geopend" aan /api/engagement als de werker de app opent of er na
 * een tijdje naar terugkeert (hoogstens eens per half uur). Daaruit leert de
 * meldingstiming op welke uren iemand bereikbaar is. Stil: een fout of de
 * alleen-lezen inspectiemodus (423) merkt niemand.
 */
export function AppOpenPing() {
  useEffect(() => {
    const meld = () => {
      if (document.visibilityState !== "visible") return;
      const nu = Date.now();
      let vorige: number | null = null;
      try {
        const v = localStorage.getItem(KEY);
        vorige = v ? Number(v) : null;
      } catch {
        // geen opslag (privévenster): de server remt dan
      }
      if (!appOpenTelt(vorige, nu)) return;
      try {
        localStorage.setItem(KEY, String(nu));
      } catch {
        // idem
      }
      void fetch("/api/engagement", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "APP_OPEN" }),
        keepalive: true,
      }).catch(() => undefined);
    };
    meld();
    document.addEventListener("visibilitychange", meld);
    return () => document.removeEventListener("visibilitychange", meld);
  }, []);
  return null;
}
