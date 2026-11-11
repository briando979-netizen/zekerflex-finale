import { logger } from "@/lib/logger";
import { kaartVan, ontwerpenVoor, type Ontwerp, type OntwerpKaart } from "@/lib/sites/ontwerpen";
import { siteBySlug } from "@/lib/sites/store";
import type { SiteSoort } from "@/lib/sites/types";

// ---------------------------------------------------------------------------
// De kaarten van Studio → Ontwerpen, met een knop "Voorbeeld bekijken" alleen
// waar het voorbeeld echt te zien is:
//  - website: de voorbeeldsite per branche maakt zich aan bij het eerste bezoek
//    (lib/sites/branche-demo.ts). Een vrij adres wordt dus het voorbeeld; heeft een
//    echt bedrijf het adres, dan is er geen voorbeeld;
//  - webshop: de voorbeeldwinkels (lib/sites/winkel-voorbeelden.ts) alleen als er op
//    dat adres al een voorbeeld online staat.
// ---------------------------------------------------------------------------

async function voorbeeldBestaat(o: Ontwerp): Promise<boolean> {
  if (!o.voorbeeldSlug) return false;
  const site = await siteBySlug(o.voorbeeldSlug);
  const isVoorbeeld = Boolean(site && (site.voorbeeld || site.tenantId.startsWith("voorbeeld")));
  if (o.soort === "website") return !site || isVoorbeeld;
  return isVoorbeeld && Boolean(site?.liveBuild);
}

export async function galerijVoor(soort: SiteSoort): Promise<OntwerpKaart[]> {
  const lijst = ontwerpenVoor(soort);
  const bestaat = await Promise.all(
    lijst.map((o) =>
      voorbeeldBestaat(o).catch((err: unknown) => {
        logger.warn("design gallery example check failed", { id: o.id, err: String(err) });
        return false;
      }),
    ),
  );
  return lijst.map((o, i) => kaartVan(o, bestaat[i] ?? false));
}
