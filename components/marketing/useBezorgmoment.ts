"use client";

import { useEffect, useState } from "react";
import { bezorgmoment, type Bezorgmoment } from "@/lib/shop/bezorgmoment";

/**
 * Het bezorgmoment (lib/shop/bezorgmoment.ts), pas in de browser uitgerekend: de server draait in UTC en weet niet wanneer de
 * pagina bekeken wordt, dus de eerste weergave (server en browser gelijk) heeft nog geen dag (geen hydratiefout).
 * Met `elkeMs` telt hij mee (de productpagina); zonder rekent hij één keer (de kaartjes).
 */
export function useBezorgmoment(elkeMs = 0): Bezorgmoment | null {
  const [b, setB] = useState<Bezorgmoment | null>(null);
  useEffect(() => {
    setB(bezorgmoment(new Date()));
    if (!elkeMs) return;
    const i = setInterval(() => setB(bezorgmoment(new Date())), elkeMs);
    return () => clearInterval(i);
  }, [elkeMs]);
  return b;
}
