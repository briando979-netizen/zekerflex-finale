import { FacturenScherm } from "@/components/studio/account/Schermen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Facturen" };

// Webshop → Facturen: het account in de studio zelf, los van /werkgever (lib/studio/account.ts).
export default function StudioWebshopFacturenPage() {
  return <FacturenScherm soort="webshop" />;
}
