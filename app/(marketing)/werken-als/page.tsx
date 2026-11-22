import type { Metadata } from "next";
import { WerkenAlsHub } from "@/components/marketing/FunctieLanding";
import { werkenAlsHubMetadata } from "@/lib/seo-functies";

// Functiezoekwoorden ("werken als schoonmaker") hadden vertoningen in Search Console (22 nov 2026), maar geen eigen pagina
// (lib/seo-functies.ts).
export const metadata: Metadata = werkenAlsHubMetadata();

export default function Page() {
  return <WerkenAlsHub />;
}
