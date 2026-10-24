import type { ReactNode } from "react";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { ChatWidgetLazy } from "@/components/marketing/ChatWidgetLazy";
import { ScrollProgress } from "@/components/marketing/ScrollProgress";
import { VisitorNudge } from "@/components/marketing/VisitorNudge";
import { CmsEditMount } from "@/components/admin/CmsEditMount";
import { getPrincipal, hasRole } from "@/lib/auth";

export default async function MarketingLayout({ children }: { children: ReactNode }) {
  const principal = await getPrincipal().catch(() => null);
  const canEdit = Boolean(principal && hasRole(principal, "PLATFORM_ADMIN"));
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <ScrollProgress />
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
      <ChatWidgetLazy />
      <VisitorNudge />
      {canEdit && <CmsEditMount />}
    </div>
  );
}
