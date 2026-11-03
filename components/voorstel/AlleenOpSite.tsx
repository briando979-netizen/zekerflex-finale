"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { isBeheerPad } from "@/lib/voorstel/subdomein";

// Omlijsting van de publieke site (voorstelbalk, menu, footer) die in het
// beheer wegvalt: dat heeft een eigen dashboard-opmaak met zijbalk.
export function AlleenOpSite({ children }: { children: ReactNode }) {
  const pad = usePathname() ?? "";
  return isBeheerPad(pad) ? null : <>{children}</>;
}
