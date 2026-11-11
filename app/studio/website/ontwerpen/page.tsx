import Ontwerpen from "@/components/studio/Ontwerpen";
import { galerijVoor } from "@/lib/sites/ontwerpen-server";

export const dynamic = "force-dynamic";

// Website → Ontwerpen: alle ontwerpen voor een website, met de voorbeeldsite per branche (lib/sites/ontwerpen.ts).
export default async function StudioWebsiteOntwerpenPage() {
  return <Ontwerpen kaarten={await galerijVoor("website")} />;
}
