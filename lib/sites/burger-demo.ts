import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { kvDelete, kvGet, kvSet } from "@/lib/storage/kv";
import { importRemoteImage } from "@/lib/media/clean-image";
import { addMedia, createSite, markExample, publishSite, saveSite, siteBySlug, siteOfTenant } from "@/lib/sites/store";
import { BURGER_BEDRIJF, BURGER_FOTOS, BURGER_SLUG, BURGER_THEMA, burgerFotoUrl, burgerPaginas, burgerWinkel, type BurgerFoto } from "@/lib/sites/burger-voorbeeld";

// ---------------------------------------------------------------------------
// De voorbeeldsite van de hamburgerzaak (lib/sites/burger-voorbeeld.ts) maakt
// zichzelf bij het eerste bezoek aan /site/burgerbar-vuur en werkt zich bij als
// VERSIE omhoog gaat, net als Bakkerij Jansen (lib/sites/demo.ts). Een echt
// bedrijf dat het adres al heeft, houdt het.
//   KV "site-voorbeeld:burger"      — { versie, siteId }
//   KV "site-voorbeeld-slot:burger" — één bouwer tegelijk
// ---------------------------------------------------------------------------

/** 1: 3D-burger, menu als webshop met winkelmand, reserveren (4 nov 2026). */
const VERSIE = 1;
const TENANT = "voorbeeld:burger";
const STATE = "site-voorbeeld:burger";
const SLOT = "site-voorbeeld-slot:burger";
const BY = { userId: "system", name: "ZekerFlex (voorbeeld)" };

async function neemSlot(): Promise<boolean> {
  try {
    await prisma.keyValueStore.create({ data: { key: SLOT, value: new Date().toISOString() } });
    return true;
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
    const sinds = await kvGet<string>(SLOT).catch(() => null);
    if (sinds && Date.now() - new Date(sinds).getTime() > 180_000) await kvDelete(SLOT);
    return false;
  }
}

/** Zorg dat de voorbeeldsite bestaat, bij is en gepubliceerd. Goedkoop als dat al zo is. */
export async function ensureBurgerDemo(): Promise<void> {
  const state = await kvGet<{ versie: number; siteId: string }>(STATE).catch(() => null);
  if (state?.versie === VERSIE) return;
  const eigenaar = await siteBySlug(BURGER_SLUG);
  if (eigenaar && eigenaar.tenantId !== TENANT) return;
  if (!(await neemSlot())) return;
  try {
    const site = (await siteOfTenant(TENANT)) ?? (await createSite(TENANT, BY, { templateId: "horeca", bedrijf: BURGER_BEDRIJF }));
    if (site.slug !== BURGER_SLUG) logger.warn("burger example got another address", { slug: site.slug });
    const ids: Partial<Record<BurgerFoto, string>> = {};
    // vier tegelijk ophalen, één voor één bewaren (addMedia herschrijft de site: tegelijk bewaren verliest foto's)
    const lijst = Object.entries(BURGER_FOTOS) as [BurgerFoto, (typeof BURGER_FOTOS)[BurgerFoto]][];
    for (let i = 0; i < lijst.length; i += 4) {
      const groep = lijst.slice(i, i + 4);
      const opgehaald = await Promise.all(
        groep.map(async ([key, f]) => {
          const url = burgerFotoUrl(f.pexels);
          const al = site.media.find((m) => m.sourceUrl === url);
          if (al) return { key, id: al.id };
          try {
            return { key, url, alt: f.alt, image: await importRemoteImage(url) };
          } catch (err) {
            logger.warn("burger example photo failed", { key, err: String(err) });
            return { key };
          }
        }),
      );
      for (const o of opgehaald) {
        if ("id" in o && o.id) ids[o.key] = o.id;
        else if ("image" in o && o.image) ids[o.key] = (await addMedia(site.id, o.image, { alt: o.alt, bron: "internet", sourceUrl: o.url })).id;
      }
    }
    const foto = (k: BurgerFoto) => ids[k] ?? null;
    await saveSite(site.id, { theme: BURGER_THEMA, bedrijf: BURGER_BEDRIJF, pages: burgerPaginas(foto) as never, winkel: burgerWinkel(foto) });
    await markExample(site.id);
    await publishSite(site.id, BY);
    await kvSet(STATE, { versie: VERSIE, siteId: site.id });
  } finally {
    await kvDelete(SLOT).catch(() => undefined);
  }
}
