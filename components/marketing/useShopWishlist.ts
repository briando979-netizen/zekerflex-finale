"use client";

import { useCallback, useEffect, useState } from "react";

// Verlanglijst voor de shop, zelfde localStorage-patroon als useShopCart —
// per browser, niet gesynchroniseerd over apparaten (net als de winkelwagen).

const KEY = "zf_shop_wishlist";
const EVT = "zf-shop-wishlist";

function read(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (Array.isArray(parsed)) return parsed.filter((id): id is string => typeof id === "string");
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

export function useShopWishlist() {
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    setIds(read());
    const sync = () => setIds(read());
    window.addEventListener(EVT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const has = useCallback((productId: string) => ids.includes(productId), [ids]);

  const toggle = useCallback((productId: string) => {
    const current = read();
    const next = current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId];
    write(next);
    setIds(next);
  }, []);

  return { ids, has, toggle, count: ids.length };
}
