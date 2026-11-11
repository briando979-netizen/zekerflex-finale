import type { ReactNode } from "react";
import { StudioShell } from "@/components/studio/StudioShell";
import { studioStand } from "@/lib/sites/studio-stand";
import { studioGebruiker } from "@/lib/studio/account-server";

// Webshop openen: de werkruimte voor de webwinkel van het bedrijf (eigen site, eigen menu),
// met de wisselaar naar de andere dashboards van het bedrijf.
export default async function StudioWebshopLayout({ children }: { children: ReactNode }) {
  return (
    <StudioShell soort="webshop" dashboards={await studioStand("webshop")} gebruiker={await studioGebruiker()}>
      {children}
    </StudioShell>
  );
}
