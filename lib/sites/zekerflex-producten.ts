import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { cleanImage, importRemoteImage, type CleanImage } from "@/lib/media/clean-image";
import { readUpload } from "@/lib/storage/local";
import { addMedia, getSite } from "@/lib/sites/store";
import { productSlug } from "@/lib/sites/winkel";
import type { Media, SiteProduct } from "@/lib/sites/types";

// ---------------------------------------------------------------------------
// Producten uit de ZekerFlex-webshop (ShopProduct) in de winkel van een
// klantsite zetten: naam, prijs, omschrijving en categorie gaan mee, en de
// productfoto wordt één keer naar de foto's van de site gekopieerd, zodat de
// klantsite zoals altijd alleen eigen foto's laadt. Daarna is het een gewoon
// product van de site: de prijs en tekst zijn vrij aan te passen.
// ---------------------------------------------------------------------------

export interface CatalogusProduct {
  id: string;
  naam: string;
  prijsCents: number;
  categorie: string;
  /** voor het plaatje in de bouwer (op zekerflex.com zelf) */
  beeld: string | null;
}

export async function zekerflexCatalogus(): Promise<CatalogusProduct[]> {
  const rows = await prisma.shopProduct.findMany({
    where: { active: true, isBundle: false },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, priceCents: true, category: true, imageUrl: true },
    take: 300,
  });
  return rows.map((r) => ({ id: r.id, naam: r.name, prijsCents: r.priceCents, categorie: r.category, beeld: r.imageUrl }));
}

/** De foto van een webshopproduct als schone WebP, of null als hij er niet (meer) is. */
async function productFoto(p: { imageUploadId: string | null; imageUrl: string | null }): Promise<CleanImage | null> {
  try {
    if (p.imageUploadId) return await cleanImage((await readUpload(p.imageUploadId)).bytes);
    const url = p.imageUrl ?? "";
    // een bestand uit public/ ("/shop/werkschoen.webp"), nooit daarbuiten
    if (/^\/[\w/.-]+\.(webp|png|jpe?g)$/i.test(url) && !url.includes("..")) return await cleanImage(await readFile(path.join(process.cwd(), "public", url)));
    if (/^https:\/\//.test(url)) return await importRemoteImage(url);
  } catch (err) {
    logger.warn("zekerflex product photo not copied", { err: String(err) });
  }
  return null;
}

const eersteZin = (s: string) => (s.split(/(?<=[.!?])\s/)[0] ?? s).trim().slice(0, 200);

/** Zet een webshopproduct klaar voor de winkel van de site; de bouwer voegt het toe en bewaart het. */
export async function koppelZekerflexProduct(siteId: string, shopProductId: string): Promise<{ product: SiteProduct; media: Media | null }> {
  const site = await getSite(siteId);
  if (!site) throw AppError.notFound("Deze website bestaat niet.");
  const p = await prisma.shopProduct.findFirst({
    where: { id: shopProductId, active: true },
    select: { id: true, name: true, description: true, category: true, priceCents: true, imageUploadId: true, imageUrl: true },
  });
  if (!p) throw AppError.notFound("Dit product staat niet (meer) in de ZekerFlex-webshop.");
  const beeld = await productFoto(p);
  const media = beeld ? await addMedia(siteId, beeld, { alt: p.name, bron: "upload" }) : null;
  const bestaand = (site.winkel?.producten ?? []).map((x) => x.slug);
  const product: SiteProduct = {
    id: `p${randomBytes(6).toString("hex").slice(0, 10)}`,
    naam: p.name.slice(0, 120),
    slug: productSlug(p.name, bestaand),
    prijsCents: p.priceCents,
    oudePrijsCents: null,
    korteTekst: eersteZin(p.description),
    omschrijving: p.description.slice(0, 4000),
    fotos: media ? [media.id] : [],
    categorie: p.category.slice(0, 60),
    zichtbaar: true,
    uitverkocht: false,
    bron: { zekerflex: p.id },
  };
  return { product, media };
}
