import type { DiepDeels } from "@/lib/i18n/talen-motor";

// Een vertaling over een andere heen leggen (talen-motor, 13 nov 2026; los gezet 28 nov 2026 zodat elke lader hem kan
// gebruiken zonder het werker-woordenboek mee te nemen). Puur: ook client-bestanden importeren dit.

/** Legt `laag` over `basis`: tekst, lijst en functie worden vervangen als het type klopt, objecten diep samengevoegd. */
export function voegSamen<T>(basis: T, laag: DiepDeels<T> | undefined): T {
  if (laag === undefined || laag === null) return basis;
  if (typeof basis !== typeof laag) return basis;
  if (Array.isArray(basis) || typeof basis !== "object" || basis === null) return laag as unknown as T;
  const uit: Record<string, unknown> = { ...(basis as Record<string, unknown>) };
  for (const [k, v] of Object.entries(laag as Record<string, unknown>)) {
    if (!Object.hasOwn(uit, k)) continue; // een sleutel die niet (meer) in de bron bestaat doet niet mee
    uit[k] = voegSamen<unknown>(uit[k], v);
  }
  return uit as T;
}
