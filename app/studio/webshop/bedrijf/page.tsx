import { BedrijfScherm } from "@/components/studio/account/Schermen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bedrijf" };

// Webshop → Bedrijf: het account in de studio zelf, los van /werkgever (lib/studio/account.ts).
export default function StudioWebshopBedrijfPage() {
  return <BedrijfScherm soort="webshop" />;
}
