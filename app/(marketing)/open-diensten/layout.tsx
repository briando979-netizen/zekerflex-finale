import type { ReactNode } from "react";
import type { Metadata } from "next";
import { robotsVerborgen } from "@/lib/seo/verbergen";

// Vlag `publiek-alleen-flexwerk`: de publieke klussen-kaart (/open-diensten en /open-diensten/3d) uit Google als de vlag aan is.
// Blijft bestaan en bereikbaar via een directe link; de bezoeker ziet de kaart pas na het aanmelden.
export async function generateMetadata(): Promise<Metadata> {
  return robotsVerborgen("/open-diensten");
}

export default function OpenDienstenLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
