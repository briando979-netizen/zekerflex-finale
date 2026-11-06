import type { ReactNode } from "react";
import { StudioShell } from "@/components/studio/StudioShell";

// Website bouwen: de werkruimte voor de website van het bedrijf (eigen site, eigen menu).
export default function StudioWebsiteLayout({ children }: { children: ReactNode }) {
  return <StudioShell soort="website">{children}</StudioShell>;
}
