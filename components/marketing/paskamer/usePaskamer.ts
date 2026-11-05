"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LENGTE_GRENZEN, STANDAARD_LICHAAM, type Lichaam, type Silhouet } from "@/lib/shop/paskamer";

// Wat iemand in de paskamer instelt: maten, huidskleur, de eigen gezichtsfoto
// en wat de paspop aan heeft. Alleen in deze browser (localStorage), nooit naar
// de server: de foto verlaat het toestel niet. De productpagina leest hetzelfde
// profiel voor het maatadvies. Zonder opslag (privévenster) werkt alles, maar
// onthoudt het niets.

const KEY = "zf_paskamer_v1";
const EVT = "zf-paskamer";

export type Aan = { productId: string; maat: string | null; kleur: string | null };
export type PaskamerStand = { lichaam: Lichaam; huid: string; gezicht: string | null; aan: Aan[] };

export const HUIDKLEUREN = ["#f3d3bd", "#e8b896", "#d9a989", "#c58c6a", "#a86f4c", "#8d5a3b", "#6b4330", "#4a2e22"] as const;
export const STANDAARD_STAND: PaskamerStand = { lichaam: STANDAARD_LICHAAM.heren, huid: "#d9a989", gezicht: null, aan: [] };

const getal = (v: unknown, min: number, max: number): number | null => (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null);
const uit = <T extends string>(v: unknown, opties: readonly T[], standaard: T): T => (opties.includes(v as T) ? (v as T) : standaard);

/** Een opgeslagen stand terug inlezen; alles wat niet klopt valt terug op de standaard. */
export function leesStand(raw: string | null): PaskamerStand {
  if (!raw) return STANDAARD_STAND;
  try {
    const d = JSON.parse(raw) as Record<string, unknown>;
    const l = (d.lichaam ?? {}) as Record<string, unknown>;
    const silhouet = uit<Silhouet>(l.silhouet, ["heren", "dames", "kind"], "heren");
    const [min, max] = LENGTE_GRENZEN[silhouet];
    const basis = STANDAARD_LICHAAM[silhouet];
    const lichaam: Lichaam = {
      silhouet,
      lengte: getal(l.lengte, min, max) ?? basis.lengte,
      gewicht: getal(l.gewicht, 15, 250),
      bouw: uit(l.bouw, ["slank", "gemiddeld", "stevig"] as const, "gemiddeld"),
      borst: getal(l.borst, 50, 170),
      taille: getal(l.taille, 40, 170),
      schoenmaat: getal(l.schoenmaat, 20, 52),
      voorkeur: uit(l.voorkeur, ["nauw", "normaal", "ruim"] as const, "normaal"),
    };
    const huid = typeof d.huid === "string" && /^#[0-9a-f]{6}$/i.test(d.huid) ? d.huid : STANDAARD_STAND.huid;
    const gezicht = typeof d.gezicht === "string" && d.gezicht.startsWith("data:image/") ? d.gezicht : null;
    const aan = Array.isArray(d.aan)
      ? (d.aan as Record<string, unknown>[])
          .filter((a) => typeof a?.productId === "string")
          .slice(0, 20)
          .map((a) => ({ productId: String(a.productId), maat: typeof a.maat === "string" ? a.maat : null, kleur: typeof a.kleur === "string" ? a.kleur : null }))
      : [];
    return { lichaam, huid, gezicht, aan };
  } catch {
    return STANDAARD_STAND;
  }
}

function lees(): PaskamerStand {
  try {
    return leesStand(window.localStorage.getItem(KEY));
  } catch {
    return STANDAARD_STAND;
  }
}

/** Bewaren; past de foto niet meer (opslag vol), dan zonder foto. Geeft terug of de foto bewaard is. */
function schrijf(stand: PaskamerStand): boolean {
  let fotoBewaard = true;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(stand));
  } catch {
    fotoBewaard = false;
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ ...stand, gezicht: null }));
    } catch {
      /* geen opslag: alleen voor deze pagina */
    }
  }
  window.dispatchEvent(new CustomEvent(EVT));
  return fotoBewaard;
}

export function usePaskamer() {
  const [stand, setStand] = useState<PaskamerStand>(STANDAARD_STAND);
  const [geladen, setGeladen] = useState(false);
  const [fotoNietBewaard, setFotoNietBewaard] = useState(false);
  const huidig = useRef<PaskamerStand>(STANDAARD_STAND);

  useEffect(() => {
    huidig.current = lees();
    setStand(huidig.current);
    setGeladen(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key !== KEY) return;
      const nieuw = lees();
      // een foto die niet in de opslag paste, blijft in dit tabblad staan
      huidig.current = nieuw.gezicht === null && huidig.current.gezicht ? { ...nieuw, gezicht: huidig.current.gezicht } : nieuw;
      setStand(huidig.current);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const zet = useCallback((wijzig: (s: PaskamerStand) => PaskamerStand) => {
    const nieuw = wijzig(huidig.current);
    huidig.current = nieuw;
    setStand(nieuw);
    setFotoNietBewaard(!schrijf(nieuw) && nieuw.gezicht !== null);
  }, []);

  return { stand, zet, geladen, fotoNietBewaard };
}

/** Alleen het profiel lezen (productpagina): null zolang er niets is ingesteld. */
export function usePaskamerProfiel(): PaskamerStand | null {
  const [stand, setStand] = useState<PaskamerStand | null>(null);
  useEffect(() => {
    const laad = () => {
      try {
        const raw = window.localStorage.getItem(KEY);
        setStand(raw ? leesStand(raw) : null);
      } catch {
        setStand(null);
      }
    };
    laad();
    window.addEventListener(EVT, laad);
    window.addEventListener("storage", laad);
    return () => {
      window.removeEventListener(EVT, laad);
      window.removeEventListener("storage", laad);
    };
  }, []);
  return stand;
}
