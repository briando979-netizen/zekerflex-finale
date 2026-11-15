import { platformBankgegevens, stripeBetalenDicht } from "@/lib/billing/overschrijving-bron";
import { rekeningBruikbaar, shopBetaalwijze } from "@/lib/shop/overschrijving";
import type { ShopBetaalwijze } from "@/lib/shop/overschrijving-kenmerk";

// De server-kant van betalen per overschrijving in de webshop (lib/shop/overschrijving.ts). Een storing bij het lezen geeft "online":
// dan doet de shop wat hij altijd deed en zegt de checkout zelf netjes dat betalen uit staat.

export async function huidigeShopBetaalwijze(): Promise<ShopBetaalwijze> {
  try {
    return shopBetaalwijze(await stripeBetalenDicht(), rekeningBruikbaar(platformBankgegevens()));
  } catch {
    return "online";
  }
}
