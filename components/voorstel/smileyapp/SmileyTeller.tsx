"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { telPad } from "@/lib/voorstel/smileyapp-cijfer-regels";

// Telt paginaweergaven van het SmileyApp-voorstel voor "Cijfers" in het beheer:
// bij elke andere pagina één POST naar /api/voorstel/smileyapp/tel met alleen
// het pad (zonder querystring) en of de bezoeker van buiten de site kwam. Geen
// cookie, geen opslag in de browser, en het adres waar iemand vandaan kwam
// gaat niet mee. Het beheer telt niet (telPad geeft daar null). Staat in de
// layout, want een klik binnen Next haalt geen nieuw document op.

export function SmileyTeller() {
  const pad = usePathname();
  const vorige = useRef<string | null>(null);
  const eerste = useRef(true);

  useEffect(() => {
    const geteld = telPad(pad);
    // op het subdomein zet KortAdres het korte adres in de balk: dezelfde pagina, dus niet nog eens tellen
    if (!geteld || geteld === vorige.current) return;
    vorige.current = geteld;
    let buiten = false;
    if (eerste.current) {
      try {
        buiten = !document.referrer || new URL(document.referrer).host !== window.location.host;
      } catch {
        buiten = true;
      }
    }
    eerste.current = false;
    void fetch("/api/voorstel/smileyapp/tel", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pad: geteld, buiten }), keepalive: true }).catch(() => undefined);
  }, [pad]);

  return null;
}
