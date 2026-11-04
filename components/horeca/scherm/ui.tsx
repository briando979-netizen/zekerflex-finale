"use client";

import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { SchermData } from "@/components/horeca/live/types";

// Kleine bouwstenen die alle schermen delen (donker, grote raakvlakken).

/** Eén actie naar /api/horeca/scherm; ok = melding, terug = "Ongedaan maken". */
export type SchermDoe = (actie: Record<string, unknown>, ok?: string, terug?: () => void) => Promise<boolean>;

export interface SchermProps {
  data: SchermData;
  doe: SchermDoe;
  /** de klok van het apparaat (ms), tikt door tussen het verversen */
  nu: number;
  /** geluid staat aan en mag (na een tik) */
  geluid: boolean;
}

const KNOP = {
  doen: "bg-[#22C55E] text-[#04130A] hover:bg-[#4ADE80]",
  rustig: "bg-white/10 text-white ring-1 ring-white/20 hover:bg-white/15",
  geld: "bg-[#F5C451] text-[#241703] hover:bg-[#F8D47A]",
  let: "bg-[#F59E0B] text-[#1C1003] hover:bg-[#FBBF24]",
  stil: "text-[#B8C4BD] ring-1 ring-white/15 hover:text-white",
} as const;

export function Knop({ soort = "rustig", groot = false, children, className = "", ...rest }: { soort?: keyof typeof KNOP; groot?: boolean; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-bold transition active:scale-[0.97] disabled:opacity-50 ${groot ? "min-h-14 px-5 text-lg" : "min-h-11 px-4 text-sm"} ${KNOP[soort]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Leeg({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-white/15 p-6 text-center text-[#9BA8A1]">{children}</p>;
}

/** Roept `op` als er een id bijkomt die er eerst niet was (niet bij de eerste keer laden). */
export function useNieuw(ids: readonly string[], op: () => void) {
  const vorige = useRef<Set<string> | null>(null);
  const opRef = useRef(op);
  useEffect(() => {
    opRef.current = op;
  });
  const sleutel = ids.join(",");
  useEffect(() => {
    const nu = new Set(sleutel ? sleutel.split(",") : []);
    if (vorige.current && [...nu].some((id) => !vorige.current?.has(id))) opRef.current();
    vorige.current = nu;
  }, [sleutel]);
}

export const minSinds = (iso: string, nu: number) => Math.max(0, Math.floor((nu - Date.parse(iso)) / 60_000));
