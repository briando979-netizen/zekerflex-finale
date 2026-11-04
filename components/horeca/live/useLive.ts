"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Gegevens die vanzelf ververst worden (dashboard, keukenscherm, handheld).
// Haalt direct op, daarna elke `elkeSec` seconden; als het tabblad verborgen is
// wat rustiger. Een fout laat de laatste gegevens staan en meldt "geen
// verbinding", zodat een keuken bij een wifi-hapering gewoon doorwerkt.
// ---------------------------------------------------------------------------

export function useLive<T>(url: string, elkeSec: number) {
  const [data, setData] = useState<T | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [verbonden, setVerbonden] = useState(true);
  const [laatst, setLaatst] = useState<number | null>(null);
  const bezig = useRef(false);

  const haal = useCallback(async () => {
    if (bezig.current) return;
    bezig.current = true;
    try {
      const res = await fetch(url, { cache: "no-store" });
      const body = (await res.json().catch(() => null)) as (T & { error?: { message?: string } }) | null;
      if (!res.ok) {
        setFout(body?.error?.message ?? "Er ging iets mis. Probeer het opnieuw.");
        setVerbonden(res.status < 500);
        return;
      }
      setData(body as T);
      setFout(null);
      setVerbonden(true);
      setLaatst(Date.now());
    } catch {
      setVerbonden(false);
    } finally {
      bezig.current = false;
    }
  }, [url]);

  useEffect(() => {
    // na het sluiten van het scherm geen nieuwe ronde meer plannen (ook niet als er nog een verzoek liep)
    let actief = true;
    void haal();
    let t: number | undefined;
    const plan = () => {
      if (!actief) return;
      window.clearTimeout(t);
      t = window.setTimeout(
        () => {
          void haal().finally(plan);
        },
        (document.hidden ? Math.max(elkeSec, 30) : elkeSec) * 1000,
      );
    };
    plan();
    const zichtbaar = () => {
      if (!document.hidden) void haal();
    };
    document.addEventListener("visibilitychange", zichtbaar);
    window.addEventListener("online", zichtbaar);
    return () => {
      actief = false;
      window.clearTimeout(t);
      document.removeEventListener("visibilitychange", zichtbaar);
      window.removeEventListener("online", zichtbaar);
    };
  }, [haal, elkeSec]);

  return { data, setData, fout, setFout, verbonden, laatst, ververs: haal };
}

/** Een klok die elke `elkeSec` seconden tikt (wachttijden op bonnen lopen door tussen het verversen). */
export function useNu(elkeSec = 15) {
  const [nu, setNu] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNu(Date.now()), elkeSec * 1000);
    return () => window.clearInterval(t);
  }, [elkeSec]);
  return nu;
}
