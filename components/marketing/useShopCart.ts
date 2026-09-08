"use client";

import { useCallback, useEffect, useState } from "react";

// Gedeelde winkelwagen voor de shop-pagina's, bewaard in localStorage zodat
// hij synchroon blijft tussen de storefront en de productdetailpagina.

const KEY = "zf_shop_cart";
const EVT = "zf-shop-cart";

export type Cart = Record<string, number>;

function read(): Cart {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    if (parsed && typeof parsed === "object") {
      return Object.fromEntries(
        Object.entries(parsed as Record<string, unknown>)
          .filter(([, v]) => typeof v === "number" && v > 0)
          .map(([k, v]) => [k, v as number]),
      );
    }
  } catch {
    /* ignore */
  }
  return {};
}

function write(cart: Cart) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(cart));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(EVT));
}

export function useShopCart() {
  const [cart, setCart] = useState<Cart>({});

  useEffect(() => {
    setCart(read());
    const sync = () => setCart(read());
    window.addEventListener(EVT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const add = useCallback((id: string, qty = 1) => {
    const next = read();
    next[id] = (next[id] ?? 0) + qty;
    if (next[id]! <= 0) delete next[id];
    write(next);
    setCart(next);
  }, []);

  const remove = useCallback((id: string) => add(id, -1), [add]);

  const setQty = useCallback((id: string, qty: number) => {
    const next = read();
    if (qty <= 0) delete next[id];
    else next[id] = qty;
    write(next);
    setCart(next);
  }, []);

  const clear = useCallback(() => {
    write({});
    setCart({});
  }, []);

  const count = Object.values(cart).reduce((s, n) => s + n, 0);

  return { cart, add, remove, setQty, clear, count };
}
