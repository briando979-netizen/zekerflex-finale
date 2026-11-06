import type { ReactNode } from "react";
import { StudioShell } from "@/components/studio/StudioShell";

// Webshop openen: de werkruimte voor de webwinkel van het bedrijf (eigen site, eigen menu).
export default function StudioWebshopLayout({ children }: { children: ReactNode }) {
  return <StudioShell soort="webshop">{children}</StudioShell>;
}
