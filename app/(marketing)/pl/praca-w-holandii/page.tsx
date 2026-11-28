import { WerkenInNederland } from "@/components/marketing/WerkenInNederland";
import { winMetadata } from "@/lib/marketing/werken-in-nederland-seo";

// Praca w Holandii (28 nov 2026): "Werken in Nederland" in het Pools, met hreflang naar de andere talen. Tekst in lib/marketing/werken-in-nederland.ts.
export const metadata = winMetadata("pl");

export default function PracaWHolandiiPage() {
  return <WerkenInNederland taal="pl" />;
}
