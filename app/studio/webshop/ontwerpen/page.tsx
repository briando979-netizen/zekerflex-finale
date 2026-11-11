import Ontwerpen from "@/components/studio/Ontwerpen";
import { galerijVoor } from "@/lib/sites/ontwerpen-server";

export const dynamic = "force-dynamic";

// Webshop → Ontwerpen: alle ontwerpen voor een webshop, zoals de thema's van Shopify (lib/sites/ontwerpen.ts).
export default async function StudioWebshopOntwerpenPage() {
  return <Ontwerpen kaarten={await galerijVoor("webshop")} />;
}
