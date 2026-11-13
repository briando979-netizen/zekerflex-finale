import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { FetchError, fetchPage } from "@/lib/website-check/fetch";
import { importRemoteImage } from "@/lib/media/clean-image";
import { storeUpload } from "@/lib/storage/local";
import { kvGet, kvListEntries, kvSet } from "@/lib/storage/kv";
import { isBruikbaar, kortAdres, leesProductPagina, leesShopifyProduct, leesWooProduct, shopifyGegevensAdres, wooGegevensAdres, type LinkProduct } from "@/lib/shop/link-product";

// ---------------------------------------------------------------------------
// "Product van een link" (Winkel-AI): de pagina ophalen via de veilige ophaler (geen interne adressen, begrensde grootte)
// en lezen met lib/shop/link-product.ts; en de foto van een adres overnemen naar onze eigen opslag (schoongemaakt, WebP),
// zodat de webshop nooit een beeld van een andere website laadt. Er wordt niets besteld of gepubliceerd: het product blijft
// uit tot de eigenaar het zelf aanzet.
// ---------------------------------------------------------------------------

const NIET_LEESBAAR =
  "Deze pagina geeft ons geen productgegevens. Grote marktplaatsen zoals AliExpress, Temu en Amazon laten hun pagina's niet door een programma lezen. Kopieer daar zelf de naam en de omschrijving en plak ze in het vak hieronder; het adres van de foto kun je apart invullen.";

export interface LinkUitkomst extends LinkProduct {
  /** de website waar het vandaan komt (alleen de naam, voor de melding) */
  bron: string;
}

export async function haalProductVanLink(url: string): Promise<LinkUitkomst> {
  let pagina: Awaited<ReturnType<typeof fetchPage>>;
  try {
    pagina = await fetchPage(url.trim(), { timeoutMs: 15_000 });
  } catch (err) {
    if (err instanceof FetchError) throw AppError.validation(err.message);
    throw err;
  }
  const bron = new URL(pagina.finalUrl).hostname.replace(/^www\./, "");
  if (pagina.status !== 200) throw AppError.validation(`Die website antwoordde met code ${pagina.status}. Controleer de link, of plak de naam en de omschrijving zelf in het vak hieronder.`);
  let product = leesProductPagina(pagina.body, pagina.finalUrl);
  let via = "pagina";
  // Geeft de pagina te weinig, dan het gegevensadres van het winkelsysteem proberen (Shopify, WooCommerce).
  if (!isBruikbaar(product)) {
    const shopify = shopifyGegevensAdres(pagina.finalUrl);
    const uitShopify = shopify ? leesShopifyProduct(await haalJson(shopify), pagina.finalUrl) : null;
    if (isBruikbaar(uitShopify)) {
      product = uitShopify;
      via = "shopify";
    } else {
      const woo = wooGegevensAdres(pagina.finalUrl);
      const uitWoo = woo ? leesWooProduct(await haalJson(woo), pagina.finalUrl) : null;
      if (isBruikbaar(uitWoo)) {
        product = uitWoo;
        via = "woocommerce";
      }
    }
  }
  // alleen de website in het logboek, nooit het hele adres (er kunnen volgcodes in staan)
  if (!isBruikbaar(product)) {
    logger.info("winkel-ai: link gaf geen productgegevens", { host: bron });
    throw AppError.validation(NIET_LEESBAAR);
  }
  logger.info("winkel-ai: product van link gelezen", { host: bron, via });
  return { ...product, bron };
}

/** Een gegevensadres ophalen en als JSON lezen; alles wat misgaat geeft null (dan proberen we de volgende bron). */
async function haalJson(adres: string): Promise<unknown> {
  try {
    const r = await fetchPage(adres, { timeoutMs: 10_000, maxBytes: 1_500_000 });
    if (r.status !== 200 || r.truncated) return null;
    return JSON.parse(r.body) as unknown;
  } catch {
    return null;
  }
}

/** De foto van een adres overnemen en aan het product hangen. Het product blijft uit. */
export async function koppelFotoVanAdres(productId: string, fotoUrl: string, actorUserId: string | null): Promise<void> {
  const product = await prisma.shopProduct.findUnique({ where: { id: productId }, select: { id: true, slug: true } });
  if (!product) throw AppError.notFound("Product niet gevonden");
  const foto = await importRemoteImage(fotoUrl);
  const upload = await storeUpload({ filename: `${product.slug}.webp`, mimeType: foto.mime, bytes: foto.bytes, uploadedById: actorUserId });
  await prisma.shopProduct.update({ where: { id: product.id }, data: { imageUploadId: upload.id, imageUrl: `/api/shop/media/${upload.id}` } });
}

// Waar een conceptproduct vandaan komt: de pagina van de leverancier en het adres van de foto. Zo kan de eigenaar later
// nagaan of hij de foto mag gebruiken. Gegevens van de winkel, niet van een gebruiker (dus niet in ERASABLE_KV_PREFIXES).
const K_BRON = "shop:link-bron:";
export interface LinkBron {
  pagina: string | null;
  foto: string | null;
  op: string;
}

export async function bewaarLinkBron(productId: string, bron: { pagina?: string | undefined; foto?: string | undefined }, now = new Date()): Promise<void> {
  if (!bron.pagina && !bron.foto) return;
  await kvSet(`${K_BRON}${productId}`, { pagina: bron.pagina ?? null, foto: bron.foto ?? null, op: now.toISOString() } satisfies LinkBron).catch(() => undefined);
}

export async function leesLinkBron(productId: string): Promise<LinkBron | null> {
  return kvGet<LinkBron>(`${K_BRON}${productId}`).catch(() => null);
}

/** De bronnen van alle conceptproducten voor het scherm, per product-id: alleen host + pad (geen querystring of token). */
export async function leesLinkBronnen(): Promise<Record<string, { pagina: string | null; foto: string | null }>> {
  const rijen = await kvListEntries<LinkBron>(K_BRON, 1000).catch(() => []);
  const uit: Record<string, { pagina: string | null; foto: string | null }> = {};
  for (const r of rijen) {
    const pagina = kortAdres(r.value?.pagina);
    const foto = kortAdres(r.value?.foto);
    if (pagina || foto) uit[r.key.slice(K_BRON.length)] = { pagina, foto };
  }
  return uit;
}
