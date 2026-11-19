"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { taalVanPad, type Taal } from "@/lib/voorstel/smileyapp-taal";

// De omlijsting van het SmileyApp-voorstel (band, kop, footer) staat in de
// layout, en die wordt bij een klik binnen de site niet opnieuw opgebouwd. De
// taal volgt daarom het pad in de browser: OpTaal toont zijn inhoud alleen op
// pagina's in die taal (/en, /de, of al het andere: Nederlands). Server en
// browser kennen hetzelfde pad, dus er is geen verschil bij het laden.

export function OpTaal({ taal, children }: { taal: Taal; children: ReactNode }) {
  return taalVanPad(usePathname()) === taal ? <>{children}</> : null;
}

/** Eén korte tekst in de taal van de pagina. */
export function TaalTekst({ nl, en, de }: Record<Taal, string>) {
  const taal = taalVanPad(usePathname());
  return <>{taal === "en" ? en : taal === "de" ? de : nl}</>;
}
