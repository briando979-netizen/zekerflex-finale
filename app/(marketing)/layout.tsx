import type { ReactNode } from "react";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { ChatWidgetLazy } from "@/components/marketing/ChatWidgetLazy";
import { ScrollProgress } from "@/components/marketing/ScrollProgress";
import { VisitorNudge } from "@/components/marketing/VisitorNudge";
import { getHoofdmenu, getVoettekst } from "@/lib/ontwerp/menu-store";
import { STANDAARD_VOETTEKST } from "@/lib/ontwerp/menu";
import { cookies } from "next/headers";
import { AankondigingsBalk } from "@/components/marketing/AankondigingsBalk";
import { BALK_COOKIE, LEGE_BALK, balkActief, balkId } from "@/lib/ontwerp/balk";
import { getBalk } from "@/lib/ontwerp/balk-store";
import { amsterdamDayKey } from "@/lib/time/amsterdam";

export default async function MarketingLayout({ children }: { children: ReactNode }) {
  // voettekst, hoofdmenu en aankondigingsbalk uit de Site-ontwerper; bij een storing gewoon de standaard (balk uit)
  const [{ voettekst }, hoofdmenu, balk] = await Promise.all([
    getVoettekst().catch(() => ({ voettekst: STANDAARD_VOETTEKST })),
    getHoofdmenu().catch(() => null),
    getBalk().catch(() => LEGE_BALK),
  ]);
  // de balk: alleen aan, binnen zijn datums (Nederlandse dag) en niet door deze bezoeker weggeklikt
  const balkCode = balkId(balk);
  const toonBalk = balkActief(balk, amsterdamDayKey(new Date())) && (await cookies()).get(BALK_COOKIE)?.value !== balkCode;
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
      {toonBalk ? <AankondigingsBalk balk={balk} id={balkCode} /> : null}
      <SiteHeader hoofdmenu={hoofdmenu} />
      <main id="main" tabIndex={-1} className="flex-1 outline-none">{children}</main>
      <SiteFooter voettekst={voettekst} />
      <ChatWidgetLazy />
      <VisitorNudge />
    </div>
  );
}
