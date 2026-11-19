import type { ReactNode } from "react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { robotsVerborgen } from "@/lib/seo/verbergen";
import { clientDict, getLocale } from "@/lib/i18n/server";
import { I18nProvider } from "@/components/i18n/I18nProvider";
import { ShopChrome } from "@/components/marketing/ShopChrome";
import { MODUS_COOKIE, leesModus } from "@/lib/shop/modus";
import { nl } from "@/lib/i18n/dictionaries";
import { contentKeys, getContentMap } from "@/lib/content/store";
import { metShopTeksten } from "@/lib/ontwerp/shop-teksten";
import { huidigeShopBetaalwijze } from "@/lib/shop/overschrijving-server";
import { prisma } from "@/lib/prisma";
import { aantalAanbiedingen, herstelVerlopenAanbiedingen } from "@/lib/shop/aanbieding-server";

export const dynamic = "force-dynamic";

// Vlag `publiek-alleen-flexwerk`: de hele webshop (/shop en alle subpagina's) uit Google als de vlag aan is. De shop blijft
// bestaan en bereikbaar via een directe link; de robots-metadata van deze layout geldt voor elke /shop-pagina.
export async function generateMetadata(): Promise<Metadata> {
  return robotsVerborgen("/shop");
}

// Eigen omlijsting (servicebalk, merkbalk met zoeken, categorieën, winkelwagen,
// voettekst) voor alle /shop-pagina's, los van de reguliere marketing-layout.
// Hergebruikt dezelfde locale-cookie/i18n-infrastructuur als /werkgever. Sinds
// de marktplaats-opbouw (4 nov 2026) alleen de gewone letters, geen schreefletter.
export default async function ShopLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  // particulier of zakelijk (functioneel cookie): bepaalt prijzen met of zonder btw en het menu
  const modus = leesModus((await cookies()).get(MODUS_COOKIE)?.value);
  // eigen teksten van de shop (Site-ontwerper → Teksten → Webshop) voor de onderdelen die in de browser draaien (assortiment,
  // filters, winkelwagen). Alleen in het Nederlands, en alleen als er echt een eigen tekst is gaat het woordenboek mee: zonder
  // eigen tekst is `eigen` hetzelfde object als `nl` en verandert er niets aan wat de browser krijgt.
  const eigen = locale === "nl" ? metShopTeksten(nl, await getContentMap(contentKeys("shop.")).catch(() => ({})), "nl") : nl;
  // hoe er nu betaald wordt (Stripe dicht sinds 11 nov): de checkout en de voettekst beloven alleen wat echt kan
  const betaalwijze = await huidigeShopBetaalwijze();
  // per categorie het aantal actieve producten: de balk en het categoriemenu tonen alleen waar iets in zit.
  // Database even weg: een lege telling, dan toont de shop de vaste categorieën.
  const telling = await prisma.shopProduct.groupBy({ by: ["category"], where: { active: true }, _count: { _all: true } }).catch(() => []);
  // verlopen aanbiedingen terug naar de gewone prijs (hooguit één keer per minuut), en hoeveel er nu lopen
  await herstelVerlopenAanbiedingen();
  const dealAantal = await aantalAanbiedingen();
  const catAantallen: Record<string, number> = {};
  for (const r of telling) catAantallen[r.category] = r._count._all;
  return (
    <I18nProvider locale={locale} t={eigen !== nl ? eigen : clientDict(locale)}>
      <ShopChrome modus={modus} betaalwijze={betaalwijze} catAantallen={catAantallen} dealAantal={dealAantal}>
        {children}
      </ShopChrome>
    </I18nProvider>
  );
}
