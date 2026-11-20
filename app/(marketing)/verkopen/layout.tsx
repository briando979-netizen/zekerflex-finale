import type { ReactNode } from "react";
import type { Metadata } from "next";
import { robotsVerborgen } from "@/lib/seo/verbergen";

// Vlag `publiek-alleen-flexwerk`: Verkopen via ZekerFlex (de webshop-verkooppartner, /verkopen en subpagina's) uit Google
// als de vlag aan is. Blijft bestaan en bereikbaar via een directe link; de robots-metadata geldt voor elke /verkopen-pagina.
export async function generateMetadata(): Promise<Metadata> {
  return robotsVerborgen("/verkopen");
}

export default function VerkopenLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
