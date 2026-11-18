import type { ReactNode } from "react";
import { DevPortalNav } from "@/components/marketing/DevPortalNav";

// Het ontwikkelaarsportaal deelt één sub-navigatie boven alle developer-pagina's.
export default function DevelopersLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <DevPortalNav />
      {children}
    </>
  );
}
