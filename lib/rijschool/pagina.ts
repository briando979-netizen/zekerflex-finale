import { cache } from "react";
import { headers } from "next/headers";
import { rijschoolVanSlug } from "@/lib/rijschool/store";
import { adresVanHost } from "@/lib/rijschool/domein";
import { SITE_HOST_HEADER } from "@/lib/sites/host-header";

// Eén databasevraag per verzoek voor de rijschool achter /rijschool/<slug>,
// gedeeld door layouts, pagina's en metadata.
export const laadRijschool = cache((slug: string) => rijschoolVanSlug(slug));

/**
 * Het begin van links binnen de site en app: "" als de bezoeker op het eigen
 * domein van de rijschool is (korte adressen: /proefles, /leerling), anders
 * "/rijschool/<slug>". Gebruik met sitePad() uit lib/rijschool/domein-pad.ts.
 */
export const linkBasis = cache(async (id: string, slug: string): Promise<string> => {
  const host = (await headers()).get(SITE_HOST_HEADER);
  const eigen = host ? await adresVanHost(host, { id }) : null;
  return eigen ? "" : `/rijschool/${slug}`;
});
