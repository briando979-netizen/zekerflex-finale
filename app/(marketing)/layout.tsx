import type { ReactNode } from "react";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { ChatWidgetLazy } from "@/components/marketing/ChatWidgetLazy";
import { ScrollProgress } from "@/components/marketing/ScrollProgress";
import { VisitorNudge } from "@/components/marketing/VisitorNudge";
import { getVoettekst } from "@/lib/ontwerp/menu-store";
import { STANDAARD_VOETTEKST } from "@/lib/ontwerp/menu";

export default async function MarketingLayout({ children }: { children: ReactNode }) {
  // de voettekst uit de Site-ontwerper; bij een storing gewoon de standaard
  const { voettekst } = await getVoettekst().catch(() => ({ voettekst: STANDAARD_VOETTEKST }));
  return (
    // zf-site: hier gelden de vormen, lettertypes en maten uit de Site-ontwerper (lib/ontwerp/thema.ts)
    <div className="zf-site flex min-h-screen flex-col bg-paper">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-brand-600 focus:px-4 focus:py-2 focus:font-semibold focus:text-white focus:shadow-lg"
      >
        Naar hoofdinhoud
      </a>
      <ScrollProgress />
      <SiteHeader />
      <main id="main" tabIndex={-1} className="flex-1 outline-none">{children}</main>
      <SiteFooter voettekst={voettekst} />
      <ChatWidgetLazy />
      <VisitorNudge />
    </div>
  );
}
