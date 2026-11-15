"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Punt } from "@/lib/kaart/afstand";

// Waar ben jij, om bij een gedeelde locatie te zien hoe ver die van je is (lib/kaart/afstand.ts), zoals in WhatsApp.
// Deel je zelf live in dit gesprek, dan is dat je plek: die kent de ander ook, dus jullie zien allebei dezelfde afstand.
// Anders je toestel, alleen met jouw toestemming: is die er al, dan stil (en elke 2 minuten opnieuw zolang het gesprek open
// is); zo niet, dan pas na een tik op "Hoe ver is dit van mij?". Die plek blijft op je toestel: hij gaat nergens heen.

export type EigenPlek = { punt: Punt; bron: "live" | "toestel" };
export type AfstandStand = "klaar" | "zoeken" | "uit";

interface AfstandWaarde {
  plek: EigenPlek | null;
  stand: AfstandStand;
  /** vraag het toestel om je plek (met de vraag om toestemming als die er nog niet is) */
  vraag: () => void;
}

const Ctx = createContext<AfstandWaarde>({ plek: null, stand: "klaar", vraag: () => undefined });

export function AfstandProvider({ mijnLive, nodig, children }: { mijnLive: Punt | null; nodig: boolean; children: ReactNode }) {
  // vast houden op de getallen: de lijst geeft bij elke weergave een nieuw object mee
  const liveLat = mijnLive?.lat;
  const liveLng = mijnLive?.lng;
  const live = useMemo<Punt | null>(() => (liveLat !== undefined && liveLng !== undefined ? { lat: liveLat, lng: liveLng } : null), [liveLat, liveLng]);
  const [toestel, setToestel] = useState<Punt | null>(null);
  const [stand, setStand] = useState<AfstandStand>("klaar");

  const meet = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStand("uit");
      return;
    }
    setStand("zoeken");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setToestel({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setStand("klaar");
      },
      (fout) => setStand(fout.code === fout.PERMISSION_DENIED ? "uit" : "klaar"),
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 15_000 },
    );
  }, []);

  // stil meten als er al toestemming is, en alleen als er een locatie van een ander in het gesprek staat
  useEffect(() => {
    if (!nodig || live) return;
    let weg = false;
    let klok: number | undefined;
    navigator.permissions
      ?.query({ name: "geolocation" as PermissionName })
      .then((s) => {
        if (weg) return;
        if (s.state === "granted") {
          meet();
          klok = window.setInterval(meet, 120_000);
        } else if (s.state === "denied") setStand("uit");
      })
      .catch(() => undefined);
    return () => {
      weg = true;
      if (klok) window.clearInterval(klok);
    };
  }, [nodig, live, meet]);

  const waarde = useMemo<AfstandWaarde>(
    () => ({ plek: live ? { punt: live, bron: "live" } : toestel ? { punt: toestel, bron: "toestel" } : null, stand, vraag: meet }),
    [live, toestel, stand, meet],
  );
  return <Ctx.Provider value={waarde}>{children}</Ctx.Provider>;
}

export function useAfstand(): AfstandWaarde {
  return useContext(Ctx);
}
