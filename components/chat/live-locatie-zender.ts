import { useCallback, useEffect, useRef, useState } from "react";
import type { Plek } from "@/lib/messaging/live-locatie";

// ---------------------------------------------------------------------------
// Live locatie versturen (15 nov 2026). Zolang je live deelt en ZekerFlex open is, meet de browser je plek
// (watchPosition) en stuurt hij die elke 15 s naar elk gesprek waarin je deelt (POST /api/inbox/<id>/live-locatie).
// Welke delingen lopen, staat per toestel in localStorage: zo gaat het na herladen gewoon door. De server beslist:
// verlopen of gestopt geeft 410, niet (meer) van jou 404; dan haalt de browser die deling uit zijn lijst.
// ---------------------------------------------------------------------------

export interface Deling {
  threadId: string;
  messageId: string;
  /** tot wanneer (ISO, UTC) */
  tot: string;
}

const SLEUTEL = "zf-live-locatie";
const STUUR_ELKE_MS = 15_000;

function isDeling(v: unknown): v is Deling {
  const d = v as Partial<Deling> | null;
  return Boolean(d && typeof d.threadId === "string" && typeof d.messageId === "string" && typeof d.tot === "string");
}

function lees(): Deling[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(SLEUTEL) ?? "[]");
    return Array.isArray(v) ? v.filter(isDeling) : [];
  } catch {
    return [];
  }
}

function bewaar(lijst: Deling[]): void {
  try {
    if (lijst.length) localStorage.setItem(SLEUTEL, JSON.stringify(lijst));
    else localStorage.removeItem(SLEUTEL);
  } catch {
    /* privévenster of geblokkeerd: dan alleen zolang de pagina open is */
  }
}

const lopend = (lijst: Deling[], nu = Date.now()) => lijst.filter((d) => new Date(d.tot).getTime() > nu);

export function useLiveLocatieZender() {
  const [delingen, setDelingen] = useState<Deling[]>([]);
  const lijstRef = useRef<Deling[]>([]);
  const plekRef = useRef<{ lat: number; lng: number } | null>(null);

  const zet = useCallback((lijst: Deling[]) => {
    lijstRef.current = lijst;
    bewaar(lijst);
    setDelingen(lijst);
  }, []);

  // na herladen: de delingen van dit toestel die nog lopen
  useEffect(() => {
    zet(lopend(lees()));
  }, [zet]);

  const haalWeg = useCallback((messageId: string) => zet(lijstRef.current.filter((d) => d.messageId !== messageId)), [zet]);

  const stuur = useCallback(async () => {
    const plek = plekRef.current;
    const lijst = lopend(lijstRef.current);
    if (lijst.length !== lijstRef.current.length) zet(lijst);
    if (!plek) return;
    for (const d of lijst) {
      const r = await fetch(`/api/inbox/${encodeURIComponent(d.threadId)}/live-locatie`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: d.messageId, lat: plek.lat, lng: plek.lng }),
      }).catch(() => null);
      // voorbij of niet (meer) van jou: stoppen; geen verbinding of een storing: de volgende ronde opnieuw
      if (r && (r.status === 410 || r.status === 404)) haalWeg(d.messageId);
    }
  }, [haalWeg, zet]);

  const bezig = delingen.length > 0;
  useEffect(() => {
    if (!bezig || typeof navigator === "undefined" || !navigator.geolocation) return;
    let eerste = true;
    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        plekRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (eerste) {
          eerste = false;
          void stuur();
        }
      },
      () => {
        /* geen plek (toestemming, binnen): de laatste blijft staan; de kaart toont hoe oud hij is */
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 },
    );
    const klok = window.setInterval(() => void stuur(), STUUR_ELKE_MS);
    return () => {
      navigator.geolocation.clearWatch(watch);
      window.clearInterval(klok);
    };
  }, [bezig, stuur]);

  /** Na het versturen van een live locatie: vanaf nu meesturen. */
  const start = useCallback(
    (d: Deling) => {
      zet([...lijstRef.current.filter((x) => x.messageId !== d.messageId), d]);
    },
    [zet],
  );

  /** Vroeg stoppen: de status van de server en, als het lukte, de serverversie van de plek (AGENTS.md: die overnemen). */
  const stop = useCallback(
    async (threadId: string, messageId: string): Promise<{ status: number | null; location?: Plek; fout?: string }> => {
      const r = await fetch(`/api/inbox/${encodeURIComponent(threadId)}/live-locatie`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, stop: true }),
      }).catch(() => null);
      const d = r ? await r.json().catch(() => ({})) : {};
      if (r && (r.ok || r.status === 410 || r.status === 404)) haalWeg(messageId);
      return {
        status: r?.status ?? null,
        ...(r?.ok && d?.location ? { location: d.location as Plek } : {}),
        ...(d?.error?.message ? { fout: String(d.error.message) } : {}),
      };
    },
    [haalWeg],
  );

  return { delingen, start, stop };
}
