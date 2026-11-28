import { WerkenInNederland } from "@/components/marketing/WerkenInNederland";
import { winMetadata } from "@/lib/marketing/werken-in-nederland-seo";

// Робота в Нідерландах (28 nov 2026): "Werken in Nederland" in het Oekraïens, met hreflang naar de andere talen. Tekst in lib/marketing/werken-in-nederland.ts.
export const metadata = winMetadata("uk");

export default function RobotaVNiderlandakhPage() {
  return <WerkenInNederland taal="uk" />;
}
