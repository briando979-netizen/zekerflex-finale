import { WerkenInNederland } from "@/components/marketing/WerkenInNederland";
import { winMetadata } from "@/lib/marketing/werken-in-nederland-seo";

// Work in the Netherlands (28 nov 2026): "Werken in Nederland" in het Engels, met hreflang naar de andere talen. Tekst in lib/marketing/werken-in-nederland.ts.
export const metadata = winMetadata("en");

export default function WorkInTheNetherlandsPage() {
  return <WerkenInNederland taal="en" />;
}
