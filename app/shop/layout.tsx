import type { ReactNode } from "react";
import { clientDict, getLocale } from "@/lib/i18n/server";
import { I18nProvider } from "@/components/i18n/I18nProvider";
import { ShopChrome } from "@/components/marketing/ShopChrome";

export const dynamic = "force-dynamic";

// Eigen omlijsting (servicebalk, merkbalk met zoeken, categorieën, winkelwagen,
// voettekst) voor alle /shop-pagina's, los van de reguliere marketing-layout.
// Hergebruikt dezelfde locale-cookie/i18n-infrastructuur als /werkgever. Sinds
// de marktplaats-opbouw (4 nov 2026) alleen de gewone letters, geen schreefletter.
export default async function ShopLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  return (
    <I18nProvider locale={locale} t={clientDict(locale)}>
      <ShopChrome>{children}</ShopChrome>
    </I18nProvider>
  );
}
