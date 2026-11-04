"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Eenvoudig venster boven de editor (Escape sluit, focus gaat naar binnen). */
export function Venster({ titel, onSluit, children, breed = false }: { titel: string; onSluit: () => void; children: ReactNode; breed?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  // In een ref: een nieuwe sluit-functie per render mag de focus niet weghalen uit een veld.
  const sluit = useRef(onSluit);
  sluit.current = onSluit;
  useEffect(() => {
    ref.current?.focus();
    const toets = (e: KeyboardEvent) => {
      if (e.key === "Escape") sluit.current();
    };
    window.addEventListener("keydown", toets);
    return () => window.removeEventListener("keydown", toets);
  }, []);
  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/55 p-3 sm:p-6" onPointerDown={(e) => e.target === e.currentTarget && onSluit()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={titel}
        tabIndex={-1}
        className={`mt-6 w-full ${breed ? "max-w-3xl" : "max-w-lg"} rounded-xl p-4 outline-none sm:p-5`}
        style={{ background: "var(--a-panel)", border: "1px solid var(--a-border)", boxShadow: "var(--a-shadow-lg)" }}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold" style={{ color: "var(--a-text)" }}>{titel}</h2>
          <button type="button" className="a-button text-xs" onClick={onSluit} aria-label="Sluiten">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
