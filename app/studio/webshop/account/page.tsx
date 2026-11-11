import { MijnAccountScherm } from "@/components/studio/account/Schermen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mijn account" };

// Webshop → Mijn account: het account in de studio zelf, los van /werkgever (lib/studio/account.ts).
export default function StudioWebshopAccountPage() {
  return <MijnAccountScherm />;
}
