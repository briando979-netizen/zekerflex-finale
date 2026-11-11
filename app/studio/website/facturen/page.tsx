import { FacturenScherm } from "@/components/studio/account/Schermen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Facturen" };

// Website → Facturen: het account in de studio zelf, los van /werkgever (lib/studio/account.ts).
export default function StudioWebsiteFacturenPage() {
  return <FacturenScherm soort="website" />;
}
