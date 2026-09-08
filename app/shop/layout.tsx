import type { ReactNode } from "react";
import { ShopChrome } from "@/components/marketing/ShopChrome";

// Eigen storefront-omlijsting (promo-balk, brede header, winkelwagen, footer)
// voor alle /shop-pagina's, los van de reguliere marketing-layout.
export default function ShopLayout({ children }: { children: ReactNode }) {
  return <ShopChrome>{children}</ShopChrome>;
}
