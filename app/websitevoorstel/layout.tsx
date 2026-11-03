import type { ReactNode } from "react";
import { SERIF_PRELOADS, fontSerif } from "@/lib/fonts-shop";
import { FontPreloads } from "@/components/ui/FontPreloads";

export const dynamic = "force-dynamic";

// Websitevoorstel (/websitevoorstel/<id>): a page of its own, without the
// marketing menu, in the same quiet luxe palette and serif as the webshop.
export default function WebsiteProposalLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`${fontSerif.variable} min-h-screen bg-lux-bg text-lux-ink`}>
      <FontPreloads hrefs={SERIF_PRELOADS} />
      {children}
    </div>
  );
}
