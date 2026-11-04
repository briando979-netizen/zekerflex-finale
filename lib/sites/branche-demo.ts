import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { kvDelete, kvGet, kvSet } from "@/lib/storage/kv";
import { importRemoteImage } from "@/lib/media/clean-image";
import { addMedia, createSite, markExample, publishSite, saveSite, siteBySlug, siteOfTenant } from "@/lib/sites/store";
import { brancheVoorbeeldPaginas, pexelsUrl, type BrancheVoorbeeld } from "@/lib/sites/branche-voorbeelden";

// ---------------------------------------------------------------------------
// De voorbeeldwebsites per branche (lib/sites/branche-voorbeelden.ts) maken zich
// aan bij het eerste bezoek en werken zich bij als VERSIE omhoog gaat, net als
// Bakkerij Jansen (lib/sites/demo.ts). Een echt bedrijf dat het adres al heeft,
// houdt het; dan is er voor die branche geen voorbeeld.
//   KV "site-voorbeeld:<branche>"      — { versie, siteId }
//   KV "site-voorbeeld-slot:<branche>" — één bouwer tegelijk
// ---------------------------------------------------------------------------

/** 1: de eerste zes branches (4 nov 2026); 2: online een tafel reserveren bij de brasserie (4 nov 2026). */
const VERSIE = 2;
const BY = { userId: "system", name: "ZekerFlex (voorbeeld)" };
const tenantVan = (v: BrancheVoorbeeld) => `voorbeeld:${v.id}`;
const STATE = (v: BrancheVoorbeeld) => `site-voorbeeld:${v.id}`;
const SLOT = (v: BrancheVoorbeeld) => `site-voorbeeld-slot:${v.id}`;

/** Eén bouwer tegelijk; een slot ouder dan drie minuten is van een vastgelopen poging. */
async function neemSlot(v: BrancheVoorbeeld): Promise<boolean> {
  try {
    await prisma.keyValueStore.create({ data: { key: SLOT(v), value: new Date().toISOString() } });
    return true;
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
    const sinds = await kvGet<string>(SLOT(v)).catch(() => null);
    if (sinds && Date.now() - new Date(sinds).getTime() > 180_000) await kvDelete(SLOT(v));
    return false;
  }
}

/** Zorg dat de voorbeeldsite van deze branche bestaat, bij is en gepubliceerd. Goedkoop als dat al zo is. */
export async function ensureBrancheVoorbeeld(v: BrancheVoorbeeld): Promise<void> {
  const state = await kvGet<{ versie: number; siteId: string }>(STATE(v)).catch(() => null);
  if (state?.versie === VERSIE) return;
  const eigenaar = await siteBySlug(v.slug);
  if (eigenaar && eigenaar.tenantId !== tenantVan(v)) return;
  if (!(await neemSlot(v))) return;
  try {
    const site = (await siteOfTenant(tenantVan(v))) ?? (await createSite(tenantVan(v), BY, { templateId: v.id, bedrijf: v.bedrijf }));
    if (site.slug !== v.slug) logger.warn("branch example got another address", { branche: v.id, slug: site.slug });
    const ids: Record<string, string> = {};
    for (const [key, f] of Object.entries(v.fotos)) {
      const url = pexelsUrl(f.pexels);
      const al = site.media.find((m) => m.sourceUrl === url);
      if (al) {
        ids[key] = al.id;
        continue;
      }
      try {
        const image = await importRemoteImage(url);
        ids[key] = (await addMedia(site.id, image, { alt: f.alt, bron: "internet", sourceUrl: url })).id;
      } catch (err) {
        logger.warn("branch example photo failed", { branche: v.id, key, err: String(err) });
      }
    }
    await saveSite(site.id, { theme: v.theme, bedrijf: v.bedrijf, pages: brancheVoorbeeldPaginas(v, (k) => ids[k] ?? null) as never });
    await markExample(site.id);
    await publishSite(site.id, BY);
    await kvSet(STATE(v), { versie: VERSIE, siteId: site.id });
  } finally {
    await kvDelete(SLOT(v)).catch(() => undefined);
  }
}
