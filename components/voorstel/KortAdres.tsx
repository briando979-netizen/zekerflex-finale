"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { kortPad } from "@/lib/voorstel/subdomein";

// Alleen op het eigen subdomein: zet na elke navigatie het korte adres in de
// adresbalk (/voorstel/schwarzwald/restaurant → /restaurant). Next houdt zijn
// router in de pas met history.replaceState; de middleware zet het korte pad
// bij vernieuwen of terug-knop weer om naar de juiste pagina.
export function KortAdres() {
  const pathname = usePathname();
  useEffect(() => {
    const { pathname: nu, search, hash } = window.location;
    const kort = kortPad(nu);
    if (kort !== nu) window.history.replaceState(window.history.state, "", `${kort}${search}${hash}`);
  }, [pathname]);
  return null;
}
