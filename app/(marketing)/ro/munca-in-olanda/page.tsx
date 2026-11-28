import { WerkenInNederland } from "@/components/marketing/WerkenInNederland";
import { winMetadata } from "@/lib/marketing/werken-in-nederland-seo";

// Muncă în Olanda (28 nov 2026): "Werken in Nederland" in het Roemeens, met hreflang naar de andere talen. Tekst in lib/marketing/werken-in-nederland.ts.
export const metadata = winMetadata("ro");

export default function MuncaInOlandaPage() {
  return <WerkenInNederland taal="ro" />;
}
