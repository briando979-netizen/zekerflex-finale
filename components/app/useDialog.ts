"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSBAAR = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Een sheet als dialoog: Escape sluit, Tab blijft binnen de sheet, de focus gaat bij het
 * openen naar het eerste element en keert bij het sluiten terug naar waar hij vandaan kwam.
 * Geef de ref aan het element met role="dialog".
 */
export function useDialog(open: boolean, onClose: () => void): RefObject<HTMLDivElement> {
  const ref = useRef<HTMLDivElement>(null);
  const sluit = useRef(onClose);
  sluit.current = onClose;

  useEffect(() => {
    if (!open) return;
    const vorige = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const lijst = () => Array.from(ref.current?.querySelectorAll<HTMLElement>(FOCUSBAAR) ?? []);
    lijst()[0]?.focus();
    function toets(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        sluit.current();
        return;
      }
      if (e.key !== "Tab") return;
      const els = lijst();
      const eerste = els[0];
      const laatste = els[els.length - 1];
      if (!eerste || !laatste) return;
      const actief = document.activeElement;
      if (e.shiftKey && (actief === eerste || !ref.current?.contains(actief))) {
        e.preventDefault();
        laatste.focus();
      } else if (!e.shiftKey && (actief === laatste || !ref.current?.contains(actief))) {
        e.preventDefault();
        eerste.focus();
      }
    }
    document.addEventListener("keydown", toets);
    return () => {
      document.removeEventListener("keydown", toets);
      vorige?.focus();
    };
  }, [open]);

  return ref;
}
