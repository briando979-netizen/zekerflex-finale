"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { ShopBetaalwijze } from "@/lib/shop/overschrijving-kenmerk";

// Hoe de shop nu betaald wordt (online, per overschrijving, of even niet), voor alle /shop-pagina's: de server leest het in
// app/shop/layout.tsx, ShopChrome geeft het door. Zo zegt de productpagina hetzelfde als de kassa (15 nov 2026: er stond
// "doorgestuurd naar een beveiligd Stripe-betaalscherm" terwijl Stripe dicht is).

const Ctx = createContext<ShopBetaalwijze>("online");

export function ShopBetaalwijzeProvider({ waarde, children }: { waarde: ShopBetaalwijze; children: ReactNode }) {
  return <Ctx.Provider value={waarde}>{children}</Ctx.Provider>;
}

export function useShopBetaalwijze(): ShopBetaalwijze {
  return useContext(Ctx);
}
