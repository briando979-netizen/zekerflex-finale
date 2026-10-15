import type { ReactNode } from "react";
import { getLocale } from "@/lib/i18n/server";
import { I18nProvider } from "@/components/i18n/I18nProvider";
import { ShopChrome } from "@/components/marketing/ShopChrome";

export const dynamic = "force-dynamic";

// Eigen storefront-omlijsting (promo-balk, brede header, winkelwagen, footer)
// voor alle /shop-pagina's, los van de reguliere marketing-layout. Hergebruikt
// dezelfde locale-cookie/i18n-infrastructuur als /werkgever.
export default async function ShopLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  return (
    <I18nProvider locale={locale}>
      <ShopChrome>{children}</ShopChrome>
    </I18nProvider>
  );
}
