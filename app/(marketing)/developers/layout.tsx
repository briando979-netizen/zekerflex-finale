import type { ReactNode } from "react";
import type { Metadata } from "next";
import { DevPortalNav } from "@/components/marketing/DevPortalNav";
import { robotsVerborgen } from "@/lib/seo/verbergen";

// Vlag `publiek-alleen-flexwerk`: het ontwikkelaarsportaal (/developers en subpagina's) uit Google als de vlag aan is.
// Blijft bestaan en bereikbaar via een directe link; de robots-metadata van deze layout geldt voor elke /developers-pagina.
export async function generateMetadata(): Promise<Metadata> {
  return robotsVerborgen("/developers");
}

// Het ontwikkelaarsportaal deelt één sub-navigatie boven alle developer-pagina's.
export default function DevelopersLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <DevPortalNav />
      {children}
    </>
  );
}
