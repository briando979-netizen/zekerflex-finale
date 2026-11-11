import sharp from "sharp";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { kvDelete, kvGet, kvSet } from "@/lib/storage/kv";
import { importRemoteImage } from "@/lib/media/clean-image";
import { pexelsUrl } from "@/lib/sites/branche-voorbeelden";
import { addMedia, createSite, markExample, publishSite, readMedia, saveSite, siteBySlug, siteOfTenant } from "@/lib/sites/store";
import { winkelVoorbeeldFotos, winkelVoorbeeldPaginas, winkelVoorbeeldThema, winkelVoorbeeldWinkel, type WinkelVoorbeeld } from "@/lib/sites/winkel-voorbeelden";

// ---------------------------------------------------------------------------
// De voorbeeldwebshops per ontwerp (lib/sites/winkel-voorbeelden.ts) maken zich
// aan bij het eerste bezoek aan /site/voorbeeldwinkel-<ontwerp> en werken zich bij
// als VERSIE omhoog gaat, net als Bakkerij Jansen (lib/sites/demo.ts) en de
// voorbeeldsites per branche (lib/sites/branche-demo.ts). Het is een webshop
// (soort "webshop"), gemarkeerd als voorbeeld: bestellen, het contactformulier en
// "mail me als het er weer is" werken, maar bewaren en versturen niets. Een echt
// bedrijf dat het adres al heeft, houdt het; dan is er voor dat ontwerp geen voorbeeld.
// Foto's: Pexels, bij het aanmaken één keer opgehaald en als media van de site
// bewaard (op ons eigen opslagvolume), daarna nooit meer van Pexels geladen.
//   KV "site-voorbeeld:winkel-<ontwerp>"      — { versie, siteId }
//   KV "site-voorbeeld-slot:winkel-<ontwerp>" — één bouwer tegelijk
// ---------------------------------------------------------------------------

/** 1: zes voorbeeldwebshops, één per ontwerp (11 nov 2026). */
const VERSIE = 1;
const BY = { userId: "system", name: "ZekerFlex (voorbeeld)" };
const tenantVan = (v: WinkelVoorbeeld) => `voorbeeld:winkel-${v.id}`;
const STATE = (v: WinkelVoorbeeld) => `site-voorbeeld:winkel-${v.id}`;
const SLOT = (v: WinkelVoorbeeld) => `site-voorbeeld-slot:winkel-${v.id}`;

/** Eén bouwer tegelijk; een slot ouder dan drie minuten is van een vastgelopen poging. */
async function neemSlot(v: WinkelVoorbeeld): Promise<boolean> {
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

/** Zorg dat de voorbeeldwebshop van dit ontwerp bestaat, bij is en gepubliceerd. Goedkoop als dat al zo is. */
export async function ensureWinkelVoorbeeld(v: WinkelVoorbeeld): Promise<void> {
  const state = await kvGet<{ versie: number; siteId: string }>(STATE(v)).catch(() => null);
  if (state?.versie === VERSIE) return;
  const eigenaar = await siteBySlug(v.slug);
  if (eigenaar && eigenaar.tenantId !== tenantVan(v)) return;
  if (!(await neemSlot(v))) return;
  try {
    // het adres komt van de naam bij het aanmaken: "Voorbeeldwinkel mode" → voorbeeldwinkel-mode; de echte naam volgt bij het opslaan
    const site = (await siteOfTenant(tenantVan(v), "webshop")) ?? (await createSite(tenantVan(v), BY, { templateId: v.id, soort: "webshop", bedrijf: { ...v.bedrijf, naam: `Voorbeeldwinkel ${v.id}` } }));
    if (site.slug !== v.slug) logger.warn("shop example got another address", { ontwerp: v.id, slug: site.slug });
    const ids: Record<string, string> = {};
    // vier tegelijk ophalen, één voor één bewaren (addMedia herschrijft de site: tegelijk bewaren verliest foto's)
    const lijst = Object.entries(winkelVoorbeeldFotos(v));
    for (let i = 0; i < lijst.length; i += 4) {
      const opgehaald = await Promise.all(
        lijst.slice(i, i + 4).map(async ([key, f]) => {
          const url = pexelsUrl(f.pexels);
          const al = site.media.find((m) => m.sourceUrl === url);
          if (al) return { key, id: al.id };
          try {
            return { key, url, alt: f.alt, image: await importRemoteImage(url) };
          } catch (err) {
            logger.warn("shop example photo failed", { ontwerp: v.id, key, err: String(err) });
            return { key };
          }
        }),
      );
      for (const o of opgehaald) {
        if ("id" in o && o.id) ids[o.key] = o.id;
        else if ("image" in o && o.image) ids[o.key] = (await addMedia(site.id, o.image, { alt: o.alt, bron: "internet", sourceUrl: o.url })).id;
      }
    }
    const foto = (k: string) => ids[k] ?? null;
    await saveSite(site.id, { theme: winkelVoorbeeldThema(v), bedrijf: v.bedrijf, pages: winkelVoorbeeldPaginas(v, foto) as never, winkel: winkelVoorbeeldWinkel(v, foto) });
    await markExample(site.id);
    await publishSite(site.id, BY);
    await kvSet(STATE(v), { versie: VERSIE, siteId: site.id });
  } finally {
    await kvDelete(SLOT(v)).catch(() => undefined);
  }
}

// Kaartfoto's voor /voorbeeldsites, per proces bewaard (Next bundelt routes apart: via globalThis).
const kaarten = ((globalThis as typeof globalThis & { __zfWinkelKaart?: Map<string, Buffer> }).__zfWinkelKaart ??= new Map<string, Buffer>());

/**
 * De openingsfoto van een voorbeeldwebshop, klein (900 × 600) voor de kaart op /voorbeeldsites.
 * Maakt de winkel aan als hij er nog niet is, net als een eerste bezoek. Null zolang er geen foto is.
 */
export async function winkelVoorbeeldKaart(v: WinkelVoorbeeld): Promise<Buffer | null> {
  await ensureWinkelVoorbeeld(v).catch((err) => logger.warn("shop example failed", { ontwerp: v.id, err: String(err) }));
  const site = await siteOfTenant(tenantVan(v), "webshop");
  const m = site?.media.find((x) => x.sourceUrl === pexelsUrl(v.hero.foto.pexels));
  if (!site || !m) return null;
  const sleutel = `${site.id}:${m.id}`;
  const al = kaarten.get(sleutel);
  if (al) return al;
  const klein = await sharp(await readMedia(site.id, m.file))
    .resize({ width: 900, height: 600, fit: "cover" })
    .webp({ quality: 78 })
    .toBuffer();
  kaarten.set(sleutel, klein);
  return klein;
}
