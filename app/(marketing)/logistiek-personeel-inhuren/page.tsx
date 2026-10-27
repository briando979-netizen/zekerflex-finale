import type { Metadata } from "next";
import { SectorHub, sectorHubMetadata } from "@/components/marketing/SectorLanding";
import { sectorBySlug } from "@/lib/seo-sectors";

const sector = sectorBySlug("logistiek-personeel-inhuren")!;
export const metadata: Metadata = sectorHubMetadata(sector);

export default function Page() {
  return <SectorHub sector={sector} />;
}
