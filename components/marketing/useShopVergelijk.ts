"use client";

import { useCallback, useEffect, useState } from "react";
import { wisselVergelijk } from "@/lib/shop/vergelijk";

// Welke producten je wilt vergelijken (lib/shop/vergelijk.ts), zelfde localStorage-patroon als de verlanglijst: per browser,
// niet over apparaten. Lukt opslaan niet (privévenster), dan werkt het gewoon tot je de pagina sluit.

const KEY = "zf_shop_vergelijk";
const EVT = "zf-shop-vergelijk";

/** De keuze zoals hij nu in de browser staat (ook buiten de hook, bijv. in een effect). */
export function leesVergelijk(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (Array.isArray(parsed)) return parsed.filter((id): id is string => typeof id === "string").slice(0, 4);
  } catch {
    /* ignore */
  }
  return [];
}

function write(ids: string[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(EVT));
}

export function useShopVergelijk() {
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    setIds(leesVergelijk());
    const sync = () => setIds(leesVergelijk());
    window.addEventListener(EVT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  /** Erbij of eraf; geeft false als er al vier staan. */
  const wissel = useCallback((productId: string): boolean => {
    const uit = wisselVergelijk(leesVergelijk(), productId);
    if (uit.vol) return false;
    write(uit.ids);
    setIds(uit.ids);
    return true;
  }, []);

  const zet = useCallback((nieuw: string[]) => {
    write(nieuw);
    setIds(nieuw);
  }, []);

  return { ids, has: (id: string) => ids.includes(id), wissel, zet, count: ids.length };
}
