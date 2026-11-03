import type { ReactNode } from "react";
import { clientDict, getLocale } from "@/lib/i18n/server";
import { I18nProvider } from "@/components/i18n/I18nProvider";
import { ShopChrome } from "@/components/marketing/ShopChrome";
import { SERIF_PRELOADS, fontSerif } from "@/lib/fonts-shop";
import { FontPreloads } from "@/components/ui/FontPreloads";

export const dynamic = "force-dynamic";

// Eigen storefront-omlijsting (aankondigingsbalk, kop, winkelwagen, voettekst)
// voor alle /shop-pagina's, los van de reguliere marketing-layout. Hergebruikt
// dezelfde locale-cookie/i18n-infrastructuur als /werkgever. De schreefletter
// (lib/fonts-shop.ts) wordt alleen hier geladen.
export default async function ShopLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  return (
    <I18nProvider locale={locale} t={clientDict(locale)}>
      <div className={fontSerif.variable}>
        <FontPreloads hrefs={SERIF_PRELOADS} />
        <ShopChrome>{children}</ShopChrome>
      </div>
    </I18nProvider>
  );
}
