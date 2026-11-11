import type { ReactNode } from "react";
import { StudioShell } from "@/components/studio/StudioShell";
import { studioStand } from "@/lib/sites/studio-stand";
import { studioGebruiker } from "@/lib/studio/account-server";

// Website bouwen: de werkruimte voor de website van het bedrijf (eigen site, eigen menu),
// met de wisselaar naar de andere dashboards van het bedrijf.
export default async function StudioWebsiteLayout({ children }: { children: ReactNode }) {
  return (
    <StudioShell soort="website" dashboards={await studioStand("website")} gebruiker={await studioGebruiker()}>
      {children}
    </StudioShell>
  );
}
