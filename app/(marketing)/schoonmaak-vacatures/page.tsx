import type { Metadata } from "next";
import { SectorWorkerHub, sectorWorkerHubMetadata } from "@/components/marketing/SectorLanding";
import { sectorBySlug } from "@/lib/seo-sectors";

const sector = sectorBySlug("schoonmaak-personeel-inhuren")!;
export const metadata: Metadata = sectorWorkerHubMetadata(sector);

export default function Page() {
  return <SectorWorkerHub sector={sector} />;
}
