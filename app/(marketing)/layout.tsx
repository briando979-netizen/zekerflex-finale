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
import { alleenFlexwerkAan } from "@/lib/seo/verbergen";
import { echteKlussenOpen } from "@/lib/marketing/echte-klussen";
import { getLocale, getSiteT } from "@/lib/i18n/server";
import { deelVertaling, verzamelTeksten } from "@/lib/i18n/site";
import { SiteTaal } from "@/components/marketing/SiteTaal";
import { AANBOD_KOLOMMEN, KOP_KNOPPEN, NAV, SNELLE_ACTIES } from "@/lib/marketing/site-nav";
import { KOP_TEKSTEN } from "@/lib/marketing/kop-teksten";

export default async function MarketingLayout({ children }: { children: ReactNode }) {
  // voettekst, hoofdmenu en aankondigingsbalk uit de Site-ontwerper; bij een storing gewoon de standaard (balk uit).
  // alleenFlexwerk: de vlag `publiek-alleen-flexwerk` (per request gelezen) — aan = de niet-flexwerk-onderdelen uit menu en voettekst.
  // echteKlussen: staat er minstens één echte (geen test-)klus open? Alleen dan belooft de bezoekerstip klussen (22 nov 2026).
  const [{ voettekst }, hoofdmenu, balk, alleenFlexwerk, echteKlussen] = await Promise.all([
    getVoettekst().catch(() => ({ voettekst: STANDAARD_VOETTEKST })),
    getHoofdmenu().catch(() => null),
    getBalk().catch(() => LEGE_BALK),
    alleenFlexwerkAan().catch(() => false),
    echteKlussenOpen().catch(() => false),
  ]);
  // de balk: alleen aan, binnen zijn datums (Nederlandse dag) en niet door deze bezoeker weggeklikt
  const balkCode = balkId(balk);
  const toonBalk = balkActief(balk, amsterdamDayKey(new Date())) && (await cookies()).get(BALK_COOKIE)?.value !== balkCode;
  // de taal van de site (28 nov 2026, lib/i18n/site.ts): de kop en het menu zijn clientonderdelen en krijgen hun zinnen al vertaald
  // mee, als gewone data; zonder taalkeuze (en dus voor Google) is het Nederlands en gaat er niets extra mee
  const locale = await getLocale();
  const tx = await getSiteT();
  const kopVertaling =
    locale === "nl" ? undefined : deelVertaling(tx, [...verzamelTeksten([NAV, KOP_KNOPPEN, SNELLE_ACTIES, AANBOD_KOLOMMEN, hoofdmenu]), ...Object.values(KOP_TEKSTEN)]);
  return (
    // zf-site: hier gelden de vormen, lettertypes en maten uit de Site-ontwerper (lib/ontwerp/thema.ts)
    <SiteTaal locale={locale} vertaling={kopVertaling}>
    <div className="zf-site flex min-h-screen flex-col bg-paper">
      <a
        href="#main"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-[100] focus-visible:rounded-lg focus-visible:bg-brand-600 focus-visible:px-4 focus-visible:py-2 focus-visible:font-semibold focus-visible:text-white focus-visible:shadow-lg"
      >
        {tx("Naar hoofdinhoud")}
      </a>
      <ScrollProgress />
      {toonBalk ? <AankondigingsBalk balk={balk} id={balkCode} /> : null}
      <SiteHeader hoofdmenu={hoofdmenu} alleenFlexwerk={alleenFlexwerk} />
      <main id="main" tabIndex={-1} className="flex-1 outline-none">{children}</main>
      <SiteFooter voettekst={voettekst} alleenFlexwerk={alleenFlexwerk} />
      <ChatWidgetLazy />
      <VisitorNudge echteKlussen={echteKlussen} />
    </div>
    </SiteTaal>
  );
}
