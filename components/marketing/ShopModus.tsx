"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { MODUS_COOKIE, MODUS_MAX_AGE, type ShopModus } from "@/lib/shop/modus";

// De keuze particulier/zakelijk voor alle /shop-pagina's. De server leest het
// cookie (app/shop/layout.tsx) en geeft de stand mee; wisselen zet het cookie
// en ververst de servercomponenten, zodat prijzen en menu meteen kloppen.

type Waarde = { modus: ShopModus; zet: (m: ShopModus, ververs?: boolean) => void };
const Ctx = createContext<Waarde>({ modus: "particulier", zet: () => undefined });
// de stand van de hele shop (de omlijsting), ook binnen een VasteModus
const BuitenCtx = createContext<Waarde>({ modus: "particulier", zet: () => undefined });

export function schrijfModusCookie(m: ShopModus) {
  try {
    document.cookie = `${MODUS_COOKIE}=${m}; path=/; max-age=${MODUS_MAX_AGE}; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
  } catch {
    /* zonder cookies blijft de keuze alleen op deze pagina */
  }
}

export function ShopModusProvider({ modus: begin, children }: { modus: ShopModus; children: ReactNode }) {
  const router = useRouter();
  const [modus, setModus] = useState<ShopModus>(begin);
  const zet = useCallback(
    (m: ShopModus, ververs = true) => {
      setModus(m);
      schrijfModusCookie(m);
      if (ververs) router.refresh();
    },
    [router],
  );
  const waarde = useMemo(() => ({ modus, zet }), [modus, zet]);
  return (
    <BuitenCtx.Provider value={waarde}>
      <Ctx.Provider value={waarde}>{children}</Ctx.Provider>
    </BuitenCtx.Provider>
  );
}

/** Een vaste stand voor een deel van de pagina (de zakelijke startpagina is altijd zakelijk). */
export function VasteModus({ modus, children }: { modus: ShopModus; children: ReactNode }) {
  const buiten = useContext(Ctx);
  const waarde = useMemo(() => ({ modus, zet: buiten.zet }), [modus, buiten.zet]);
  return <Ctx.Provider value={waarde}>{children}</Ctx.Provider>;
}

export const useShopModus = () => useContext(Ctx);

/** Op de zakelijke startpagina: wie daar binnenkomt, winkelt verder zakelijk (de pagina zelf is al zakelijk). */
export function ZakelijkVastzetten() {
  const { zet } = useContext(BuitenCtx);
  useEffect(() => {
    zet("zakelijk", false);
  }, [zet]);
  return null;
}
