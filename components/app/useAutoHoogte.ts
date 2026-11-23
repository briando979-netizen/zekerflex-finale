"use client";

import { useEffect, type RefObject } from "react";

/**
 * Laat een tekstvak meegroeien met zijn tekst, zodat er niets wordt afgekapt (23 nov 2026: de voorbeeldtekst in het veld
 * Kledingvoorschriften viel op een telefoon van 390 px aan het eind af). `rows` blijft de minimale hoogte. De hoogte volgt ook
 * de breedte van het scherm (telefoon draaien). Staat het vak verborgen (display: none, zoals stap 1 van de klus-wizard als je
 * in stap 2 zit), dan meet de browser 0: dan laten we de hoogte met rust en meten we opnieuw zodra `zichtbaar` weer waar is.
 */
export function useAutoHoogte(ref: RefObject<HTMLTextAreaElement | null>, waarde: string, zichtbaar = true): void {
  useEffect(() => {
    const ta = ref.current;
    if (!ta || !zichtbaar) return;
    const pas = () => {
      ta.style.height = "auto";
      if (ta.scrollHeight === 0) return;
      // scrollHeight telt de rand niet mee: bij box-sizing border-box erbij optellen
      ta.style.height = `${ta.scrollHeight + (ta.offsetHeight - ta.clientHeight)}px`;
    };
    pas();
    window.addEventListener("resize", pas);
    return () => window.removeEventListener("resize", pas);
  }, [ref, waarde, zichtbaar]);
}
