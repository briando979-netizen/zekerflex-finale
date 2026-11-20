import type { ReactNode } from "react";
import type { Metadata } from "next";
import { robotsVerborgen } from "@/lib/seo/verbergen";

// Vlag `publiek-alleen-flexwerk`: de publieke open-klussen-lijst (/klussen) en elke losse klus (/klussen/<id>) uit Google
// als de vlag aan is. Blijven bestaan en bereikbaar via een directe link; de bezoeker ziet klussen pas na het aanmelden.
export async function generateMetadata(): Promise<Metadata> {
  return robotsVerborgen("/klussen");
}

export default function KlussenLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
