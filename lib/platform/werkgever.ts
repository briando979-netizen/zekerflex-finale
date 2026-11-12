import { env } from "@/lib/env";
import { platformPartij } from "@/lib/efactuur/instellingen";
import type { WerkgeverGegevens } from "@/lib/payroll/loonstrook-pdf";

// De werkgever op de loonstrook (12 nov 2026). Eén bron: dezelfde bedrijfsgegevens als op de e-factuur
// (platformPartij: PLATFORM_LEGAL_NAME, standaard PLATFORM_NAAM uit lib/platform/bedrijf.ts, en de PLATFORM_*-adresvelden),
// plus het loonheffingennummer. Wat niet is ingesteld, blijft leeg en staat dan niet op de strook: Zekerflex, Inc. heeft
// geen KvK-nummer (Delaware), en het loonheffingennummer komt van de accountant (eigenaar-taak "loonheffingennummer").

export function werkgeverVoorLoonstrook(): WerkgeverGegevens {
  const p = platformPartij();
  const plaatsRegel = [p.postcode, p.plaats].filter(Boolean).join(" ");
  const adres = [p.straat, plaatsRegel].filter(Boolean).join(", ");
  const lhn = env.PLATFORM_LOONHEFFINGENNUMMER?.replace(/\s/g, "").toUpperCase();
  return { naam: p.naam, adres: adres || null, kvk: p.kvk ?? null, loonheffingennummer: lhn || null };
}
