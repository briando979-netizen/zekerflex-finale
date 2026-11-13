import type { z } from "zod";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { kvGet, kvSet } from "@/lib/storage/kv";
import type { createSchema } from "@/lib/sites/schema";
import { createSite, getSite, siteOfTenant, zetActieveSite } from "@/lib/sites/store";
import type { SiteDoc, SiteSoort } from "@/lib/sites/types";
import { MAX_SITES_PER_SOORT, leesLijst, magErbij, metIds, regelVan, sorteerRegels, soortVanSite, type SiteRegel } from "@/lib/sites/meer-sites-core";

// ---------------------------------------------------------------------------
// Opslag van "meer sites per bedrijf" (regels en uitleg: lib/sites/meer-sites-core.ts). Eén sleutel per bedrijf met de id's van
// al zijn sites; gegevens van het bedrijf, niet van een gebruiker (dus niet in ERASABLE_KV_PREFIXES). De sites die open staan
// horen er altijd bij, ook als de lijst nog niet bestaat (bedrijven van vóór deze functie) of even niet te lezen is: er raakt
// dus nooit een site uit beeld.
// ---------------------------------------------------------------------------

const lijstKey = (tenantId: string) => `site-lijst:${tenantId}`;

async function alleSites(tenantId: string): Promise<{ sites: SiteDoc[]; actief: string[]; lijst: string[] }> {
  const [bewaard, web, shop] = await Promise.all([kvGet<unknown>(lijstKey(tenantId)).catch(() => null), siteOfTenant(tenantId, "website"), siteOfTenant(tenantId, "webshop")]);
  const actief = [web?.id, shop?.id].filter((v): v is string => Boolean(v));
  const lijst = metIds(leesLijst(bewaard), ...actief);
  const docs = await Promise.all(lijst.map((id) => getSite(id).catch(() => null)));
  // alleen sites die echt van dit bedrijf zijn (een site kan zijn overgezet of gewist)
  return { sites: docs.filter((s): s is SiteDoc => Boolean(s && s.tenantId === tenantId)), actief, lijst };
}

/** Alle sites van het bedrijf, voor het overzicht in de Studio. */
export async function sitesVanTenant(tenantId: string): Promise<SiteRegel[]> {
  const { sites, actief } = await alleSites(tenantId);
  return sorteerRegels(sites.map((s) => regelVan(s, actief)));
}

/**
 * Nog een website of webshop maken. De site die nu open staat blijft bestaan en online; hij staat daarna in de lijst en de
 * nieuwe site staat open. Eerst wordt de lijst met de bestaande sites bewaard, pas dan komt de nieuwe erbij.
 */
export async function maakExtraSite(tenantId: string, by: { userId: string; name: string }, input: z.infer<typeof createSchema>): Promise<SiteDoc> {
  const soort: SiteSoort = input.soort ?? "website";
  const { sites, lijst } = await alleSites(tenantId);
  if (!magErbij(sites, soort)) throw AppError.conflict(`Je hebt al ${MAX_SITES_PER_SOORT} ${soort === "webshop" ? "webshops" : "websites"}; dat is het meeste.`);
  await kvSet(lijstKey(tenantId), lijst);
  const site = await createSite(tenantId, by, { ...input, soort }, { extra: true });
  await kvSet(lijstKey(tenantId), metIds(lijst, site.id));
  return site;
}

/** Een andere site openen in de Studio: de verwijzing van die soort omzetten. Aan de sites zelf verandert niets. */
export async function kiesSite(tenantId: string, siteId: string, by: { userId: string }): Promise<SiteRegel> {
  const { sites, lijst } = await alleSites(tenantId);
  const site = sites.find((s) => s.id === siteId);
  if (!site) throw AppError.notFound("Deze site hoort niet bij je bedrijf.");
  await kvSet(lijstKey(tenantId), lijst);
  await zetActieveSite(tenantId, site);
  await recordAudit({ category: "SALES", action: "site.gekozen", actorUserId: by.userId, summary: `${soortVanSite(site) === "webshop" ? "Webshop" : "Website"} ${site.slug} geopend in de Studio`, targetType: "site", targetId: site.id });
  return regelVan(site, [site.id]);
}
