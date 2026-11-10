import type { ReactNode } from "react";
import { StudioShell } from "@/components/studio/StudioShell";
import { studioStand } from "@/lib/sites/studio-stand";

// Webshop openen: de werkruimte voor de webwinkel van het bedrijf (eigen site, eigen menu),
// met de wisselaar naar de andere dashboards van het bedrijf.
export default async function StudioWebshopLayout({ children }: { children: ReactNode }) {
  return (
    <StudioShell soort="webshop" dashboards={await studioStand("webshop")}>
      {children}
    </StudioShell>
  );
}
