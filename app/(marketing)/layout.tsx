import type { ReactNode } from "react";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { ChatWidgetLazy } from "@/components/marketing/ChatWidgetLazy";
import { ScrollProgress } from "@/components/marketing/ScrollProgress";
import { VisitorNudge } from "@/components/marketing/VisitorNudge";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-brand-600 focus:px-4 focus:py-2 focus:font-semibold focus:text-white focus:shadow-lg"
      >
        Naar hoofdinhoud
      </a>
      <ScrollProgress />
      <SiteHeader />
      <main id="main" tabIndex={-1} className="flex-1 outline-none">{children}</main>
      <SiteFooter />
      <ChatWidgetLazy />
      <VisitorNudge />
    </div>
  );
}
