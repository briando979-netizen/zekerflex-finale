"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { isBeheerPad } from "@/lib/voorstel/subdomein";

// Omlijsting van de publieke site (voorstelbalk, menu, footer) die in het
// beheer wegvalt: dat heeft een eigen dashboard-opmaak met zijbalk. `basis` is
// het basispad van het voorstel (standaard Schwarzwald).
export function AlleenOpSite({ children, basis }: { children: ReactNode; basis?: string }) {
  const pad = usePathname() ?? "";
  return (basis ? isBeheerPad(pad, basis) : isBeheerPad(pad)) ? null : <>{children}</>;
}
