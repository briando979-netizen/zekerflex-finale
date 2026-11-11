import { TeamScherm } from "@/components/studio/account/Schermen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Team" };

// Website → Team: het account in de studio zelf, los van /werkgever (lib/studio/account.ts).
export default function StudioWebsiteTeamPage() {
  return <TeamScherm soort="website" />;
}
