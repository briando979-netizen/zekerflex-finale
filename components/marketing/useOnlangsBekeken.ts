"use client";

import { useCallback, useEffect, useState } from "react";

// "Onlangs bekeken" in de shop: de laatst geopende producten (nieuwste eerst,
// hooguit 12), alleen in deze browser (localStorage), nooit naar de server.

const KEY = "zf_shop_bekeken";
const EVT = "zf-shop-bekeken";
const MAX = 12;

/** Opgeslagen lijst inlezen; alleen geldige id's, zonder dubbele. */
export function leesBekeken(raw: string | null): string[] {
  try {
    const d = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(d) ? [...new Set(d.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length < 64))].slice(0, MAX) : [];
  } catch {
    return [];
  }
}

/** Een product vooraan zetten (ook als het er al in stond). */
export const metBekeken = (lijst: string[], id: string): string[] => [id, ...lijst.filter((x) => x !== id)].slice(0, MAX);

export function useOnlangsBekeken() {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    const laad = () => {
      try {
        setIds(leesBekeken(window.localStorage.getItem(KEY)));
      } catch {
        setIds([]);
      }
    };
    laad();
    window.addEventListener(EVT, laad);
    return () => window.removeEventListener(EVT, laad);
  }, []);
  const schrijf = (lijst: string[]) => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(lijst));
    } catch {
      /* zonder opslag onthouden we niets */
    }
    window.dispatchEvent(new CustomEvent(EVT));
  };
  const bekeken = useCallback((id: string) => {
    let oud: string[] = [];
    try {
      oud = leesBekeken(window.localStorage.getItem(KEY));
    } catch {
      /* leeg */
    }
    schrijf(metBekeken(oud, id));
  }, []);
  const wis = useCallback(() => schrijf([]), []);
  return { ids, bekeken, wis };
}
