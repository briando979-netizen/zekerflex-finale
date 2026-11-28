import { WerkenInNederland } from "@/components/marketing/WerkenInNederland";
import { winMetadata } from "@/lib/marketing/werken-in-nederland-seo";

// Werken in Nederland (28 nov 2026): "Werken in Nederland" in het Nederlands, voor wie over de grens woont, met hreflang naar de andere talen. Tekst in lib/marketing/werken-in-nederland.ts.
export const metadata = winMetadata("nl");

export default function WerkenInNederlandPage() {
  return <WerkenInNederland taal="nl" />;
}
