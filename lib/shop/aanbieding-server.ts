import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { DEAL_FOUT_TEKST, DEAL_VENSTER_DAGEN, controleerDeal, historieDekt, laagsteIn30Dagen, variantActiePrijs } from "@/lib/shop/aanbieding";

// De serverkant van aanbiedingen (lib/shop/aanbieding.ts): starten, stoppen en verlopen aanbiedingen terugzetten.
// De prijshistorie schrijft de database zelf (trigger op ShopProduct en ShopProductVariant, migratie
// 20261118060000_shop_aanbieding), dus elke weg die een prijs wijzigt telt mee.

const DAG = 86_400_000;

/** De prijsmomenten van een product (variantId null) of een variant die voor het 30-dagenvenster tellen. */
async function momenten(productId: string, variantId: string | null, nu: Date) {
  const start = new Date(nu.getTime() - DEAL_VENSTER_DAGEN * DAG);
  const [binnen, ervoor] = await Promise.all([
    prisma.shopPriceLog.findMany({ where: { productId, variantId, at: { gte: start, lte: nu } }, select: { priceCents: true, at: true } }),
    prisma.shopPriceLog.findFirst({ where: { productId, variantId, at: { lt: start } }, orderBy: { at: "desc" }, select: { priceCents: true, at: true } }),
  ]);
  return ervoor ? [...binnen, ervoor] : binnen;
}

export async function laagstePrijs30Dagen(productId: string, nu = new Date()): Promise<number | null> {
  return laagsteIn30Dagen(await momenten(productId, null, nu), nu);
}

/** Dekt de historie van dit product het hele venster, en zo niet: vanaf wanneer wel? (lib/shop/aanbieding.ts) */
export async function historieVan(product: { id: string; createdAt: Date }, nu = new Date()): Promise<{ dekt: boolean; vanaf: Date | null }> {
  const eerste = await prisma.shopPriceLog.findFirst({ where: { productId: product.id, variantId: null }, orderBy: { at: "asc" }, select: { at: true } });
  return historieDekt(eerste?.at ?? null, product.createdAt, nu);
}

const datumNl = (d: Date) => d.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" });

/** Start een aanbieding. Gooit een nette fout (422) als hij niet eerlijk is of er al een loopt. */
export async function startAanbieding(a: { productId: string; nieuwCents: number; eindigt: Date; nu?: Date }) {
  const nu = a.nu ?? new Date();
  const product = await prisma.shopProduct.findUnique({ where: { id: a.productId }, include: { variants: { select: { id: true, priceCents: true } } } });
  if (!product) throw AppError.notFound("Product niet gevonden.");
  if (product.dealNormaalCents !== null) throw AppError.validation("Er loopt al een aanbieding op dit product. Stop die eerst.");
  const laagste = await laagstePrijs30Dagen(product.id, nu);
  const historie = await historieVan(product, nu);
  const fout = controleerDeal({ nieuwCents: a.nieuwCents, laagste, eindigt: a.eindigt, nu, historieVolledig: historie.dekt });
  if (fout === "historie-te-kort" && historie.vanaf) throw AppError.validation(`${DEAL_FOUT_TEKST[fout]} Het kan vanaf ${datumNl(historie.vanaf)}.`);
  if (fout || laagste === null) throw AppError.validation(DEAL_FOUT_TEKST[fout ?? "geen-historie"]);

  // varianten met een eigen prijs: dezelfde korting, en hun eigen laagste prijs van de laatste 30 dagen als "van"-prijs
  const eigen = product.variants.filter((v): v is { id: string; priceCents: number } => v.priceCents !== null);
  const variantVan = new Map<string, number>();
  for (const v of eigen) {
    const l = laagsteIn30Dagen(await momenten(product.id, v.id, nu), nu) ?? v.priceCents;
    variantVan.set(v.id, Math.min(l, v.priceCents));
  }
  return prisma.$transaction(async (tx) => {
    for (const v of eigen) {
      const actie = variantActiePrijs(v.priceCents, product.priceCents, a.nieuwCents);
      const van = variantVan.get(v.id) ?? v.priceCents;
      // een variant waarvan de actieprijs niet onder zijn eigen laagste prijs komt, krijgt geen doorgestreepte prijs
      await tx.shopProductVariant.update({ where: { id: v.id }, data: { priceCents: actie, dealNormaalCents: v.priceCents, dealVanCents: actie < van ? van : null } });
    }
    return tx.shopProduct.update({ where: { id: product.id }, data: { priceCents: a.nieuwCents, dealVanCents: laagste, dealNormaalCents: product.priceCents, dealEindigt: a.eindigt } });
  });
}

/** Stopt de aanbieding van één product: de gewone prijzen komen terug. Geen aanbieding: er gebeurt niets. */
export async function stopAanbieding(productId: string) {
  const product = await prisma.shopProduct.findUnique({ where: { id: productId }, include: { variants: { select: { id: true, dealNormaalCents: true } } } });
  if (!product) throw AppError.notFound("Product niet gevonden.");
  if (product.dealNormaalCents === null) return product;
  const normaal = product.dealNormaalCents;
  return prisma.$transaction(async (tx) => {
    for (const v of product.variants) {
      if (v.dealNormaalCents !== null) await tx.shopProductVariant.update({ where: { id: v.id }, data: { priceCents: v.dealNormaalCents, dealNormaalCents: null, dealVanCents: null } });
    }
    return tx.shopProduct.update({ where: { id: product.id }, data: { priceCents: normaal, dealVanCents: null, dealNormaalCents: null, dealEindigt: null } });
  });
}

// De shop kijkt hooguit één keer per minuut of er aanbiedingen verlopen zijn (gedeelde staat via globalThis: Next
// bundelt routes apart). De winkel toont een verlopen aanbieding hoe dan ook niet meer als aanbieding (dealActief).
const staat = globalThis as unknown as { zfDealHerstel?: number };

/** Zet verlopen aanbiedingen terug naar de gewone prijs. Geeft het aantal terug; fouten houden de shop niet tegen. */
export async function herstelVerlopenAanbiedingen(nu = new Date(), forceer = false): Promise<number> {
  if (!forceer && staat.zfDealHerstel && nu.getTime() - staat.zfDealHerstel < 60_000) return 0;
  staat.zfDealHerstel = nu.getTime();
  try {
    const verlopen = await prisma.shopProduct.findMany({ where: { dealNormaalCents: { not: null }, dealEindigt: { lte: nu } }, select: { id: true }, take: 50 });
    for (const p of verlopen) await stopAanbieding(p.id);
    return verlopen.length;
  } catch {
    return 0;
  }
}

/** Het aantal producten dat nu in de aanbieding is (voor de link Aanbiedingen in de balk). */
export async function aantalAanbiedingen(nu = new Date()): Promise<number> {
  return prisma.shopProduct.count({ where: { active: true, dealVanCents: { not: null }, dealEindigt: { gt: nu } } }).catch(() => 0);
}
