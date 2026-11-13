import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { clientDict, getLocale } from "@/lib/i18n/server";
import { I18nProvider } from "@/components/i18n/I18nProvider";
import { ShopChrome } from "@/components/marketing/ShopChrome";
import { MODUS_COOKIE, leesModus } from "@/lib/shop/modus";
import { nl } from "@/lib/i18n/dictionaries";
import { contentKeys, getContentMap } from "@/lib/content/store";
import { metShopTeksten } from "@/lib/ontwerp/shop-teksten";

export const dynamic = "force-dynamic";

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
  return (
    <I18nProvider locale={locale} t={eigen !== nl ? eigen : clientDict(locale)}>
      <ShopChrome modus={modus}>{children}</ShopChrome>
    </I18nProvider>
  );
}
