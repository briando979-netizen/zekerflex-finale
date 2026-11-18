import { dealActief } from "@/lib/shop/aanbieding";
import type { Metadata } from "next";
import { ldJson } from "@/lib/seo/json-ld";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { canonical, productJsonLd } from "@/lib/seo";
import { ProductDetail, type PdpProduct } from "@/components/marketing/ProductDetail";
import { boughtTogether } from "@/lib/shop/recommend";
import { getModel3D, model3dUrl } from "@/lib/shop/model3d";
import { kleurFotos } from "@/lib/shop/kleurfoto";
import { seoBeschrijving, seoTitel } from "@/lib/seo-tekst";
import { zichtbareBeoordelingen } from "@/lib/shop/beoordeling-server";
import { herkomstVan } from "@/lib/shop/levertijd";
import { levertijdenVoor } from "@/lib/shop/levertijd-server";

export const dynamic = "force-dynamic";

function toDto(p: {
  id: string; slug: string; name: string; description: string; category: string;
  priceCents: number; stock: number; imageUrl: string | null; modelPhotoUrl: string | null; badge: string | null;
  fotos?: string[];
  dealVanCents?: number | null;
  dealEindigt?: Date | null;
  collection?: string | null;
  gender?: string | null;
  seller?: { name: string } | null;
  variants?: { id: string; sku?: string; size: string | null; color: string | null; priceCents: number | null; stock: number; dealVanCents?: number | null }[];
  bundleOf?: { itemProduct: { id: string; name: string; imageUrl: string | null; priceCents: number } }[];
  /** levertijd in dagen voor een leveranciersproduct (lib/shop/levertijd-server.ts) */
  levertijd?: string | null;
}): PdpProduct {
  // loopt er nu een aanbieding? Alleen dan gaat de "van"-prijs mee naar de pagina (lib/shop/aanbieding.ts)
  const actie = dealActief({ priceCents: p.priceCents, dealVanCents: p.dealVanCents ?? null, dealEindigt: p.dealEindigt ?? null }, new Date());
  return {
    id: p.id, slug: p.slug, name: p.name, description: p.description, category: p.category,
    priceCents: p.priceCents, vanCents: actie ? (p.dealVanCents ?? null) : null, stock: p.stock, imageUrl: p.imageUrl, modelPhotoUrl: p.modelPhotoUrl, badge: p.badge,
    fotos: p.fotos ?? [],
    collection: p.collection ?? null,
    variants: p.variants
      ? p.variants.map((x) => ({ id: x.id, size: x.size, color: x.color, priceCents: x.priceCents, stock: x.stock, vanCents: actie && x.priceCents !== null && typeof x.dealVanCents === "number" && x.dealVanCents > x.priceCents ? x.dealVanCents : null }))
      : [{ id: p.id, size: null, color: null, priceCents: null, stock: p.stock }],
    ...(p.bundleOf ? { bundleItems: p.bundleOf.map((b) => b.itemProduct) } : {}),
    seller: p.seller?.name ?? null,
    gender: p.gender ?? null,
    herkomst: herkomstVan({ seller: p.seller?.name ?? null, variants: p.variants ?? [] }),
    levertijd: p.levertijd ?? null,
  };
}

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const params = await props.params;
  const p = await prisma.shopProduct.findUnique({ where: { slug: params.slug } });
  if (!p) return { title: { absolute: "Product niet gevonden — ZekerFlex Shop" } };
  const title = `${p.name} — ZekerFlex Shop`;
  const description = p.description.slice(0, 160);
  return {
    // het merk één keer, op Google-lengte (lib/seo-tekst.ts); de beschrijving tot een hele zin
    title: { absolute: seoTitel(p.name, "ZekerFlex Shop") },
    description: seoBeschrijving(p.description),
    ...canonical(`/shop/${p.slug}`, { title, description, ...(p.imageUrl ? { image: p.imageUrl } : {}) }),
  };
}

export default async function ProductPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const product = await prisma.shopProduct.findUnique({
    where: { slug: params.slug },
    include: {
      variants: { orderBy: { createdAt: "asc" } },
      bundleOf: { include: { itemProduct: { select: { id: true, name: true, imageUrl: true, priceCents: true } } } },
      seller: { select: { name: true } },
    },
  });
  if (!product || !product.active) notFound();

  // "Vaak samen gekocht" from real orders first, topped up from the same category.
  const togetherIds = await boughtTogether(product.id, 4).catch(() => [] as string[]);
  const together = togetherIds.length
    ? (await prisma.shopProduct.findMany({ where: { id: { in: togetherIds }, active: true }, include: { seller: { select: { name: true } }, variants: { orderBy: { createdAt: "asc" } } } })).sort((a, b) => togetherIds.indexOf(a.id) - togetherIds.indexOf(b.id))
    : [];
  const fill = await prisma.shopProduct.findMany({
    where: { active: true, category: product.category, id: { notIn: [product.id, ...together.map((p) => p.id)] } },
    orderBy: { sortOrder: "asc" },
    take: Math.max(0, 4 - together.length),
    include: { seller: { select: { name: true } }, variants: { orderBy: { createdAt: "asc" } } },
  });
  const related = [...together, ...fill];
  const model3d = await getModel3D(product.id);
  const beoordelingen = await zichtbareBeoordelingen(product.id).catch(() => null);
  const levertijden = await levertijdenVoor([product.id, ...related.map((p) => p.id)]);

  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: ldJson(
            productJsonLd({
              name: product.name,
              description: product.description,
              slug: product.slug,
              priceCents: product.priceCents,
              inStock: product.stock > 0,
              imageUrl: product.imageUrl,
              variants: product.variants.map((v) => ({ priceCents: v.priceCents, stock: v.stock })),
              sellerName: product.seller?.name ?? null,
              ...(beoordelingen && beoordelingen.samenvatting.aantal > 0 ? { beoordelingen } : {}),
            }),
          ),
        }}
      />
      <ProductDetail
        product={{ ...toDto({ ...product, levertijd: levertijden.get(product.id) ?? null }), model3dUrl: model3d ? model3dUrl(product.id) : null, kleurFotos: kleurFotos(product) }}
        related={related.map((p) => toDto({ ...p, levertijd: levertijden.get(p.id) ?? null }))}
        boughtTogether={together.length > 0}
        beoordelingen={beoordelingen}
      />
    </>
  );
}
