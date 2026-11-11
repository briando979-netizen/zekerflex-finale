import { TeamScherm } from "@/components/studio/account/Schermen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Team" };

// Webshop → Team: het account in de studio zelf, los van /werkgever (lib/studio/account.ts).
export default function StudioWebshopTeamPage() {
  return <TeamScherm soort="webshop" />;
}
