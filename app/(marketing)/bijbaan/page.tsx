import type { Metadata } from "next";
import { BijbaanHub } from "@/components/marketing/BijbaanLanding";
import { bijbaanHubMetadata } from "@/lib/seo-bijbaan";

// "Bijbaan" had de meeste vertoningen in Search Console (22 nov 2026), maar geen eigen pagina (lib/seo-bijbaan.ts).
export const metadata: Metadata = bijbaanHubMetadata();

export default function Page() {
  return <BijbaanHub />;
}
