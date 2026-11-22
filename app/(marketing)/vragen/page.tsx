import type { Metadata } from "next";
import { VragenHub } from "@/components/marketing/VraagLanding";
import { vragenHubMetadata } from "@/lib/seo-vragen";

// Korte antwoorden voor bedrijven die AI-assistenten en Google kunnen aanhalen (22 nov 2026, lib/seo-vragen.ts).
export const metadata: Metadata = vragenHubMetadata();

export default function Page() {
  return <VragenHub />;
}
