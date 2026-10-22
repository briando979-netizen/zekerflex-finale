import type { Metadata } from "next";
import { ldJson } from "@/lib/seo/json-ld";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { canonical, productJsonLd } from "@/lib/seo";
import { ProductDetail, type PdpProduct } from "@/components/marketing/ProductDetail";
import { boughtTogether } from "@/lib/shop/recommend";

export const dynamic = "force-dynamic";

function toDto(p: {
  id: string; slug: string; name: string; description: string; category: string;
  priceCents: number; stock: number; imageUrl: string | null; modelPhotoUrl: string | null; badge: string | null;
  variants?: { id: string; size: string | null; color: string | null; priceCents: number | null; stock: number }[];
  bundleOf?: { itemProduct: { id: string; name: string; imageUrl: string | null; priceCents: number } }[];
}): PdpProduct {
  return {
    id: p.id, slug: p.slug, name: p.name, description: p.description, category: p.category,
    priceCents: p.priceCents, stock: p.stock, imageUrl: p.imageUrl, modelPhotoUrl: p.modelPhotoUrl, badge: p.badge,
    variants: p.variants ?? [{ id: p.id, size: null, color: null, priceCents: null, stock: p.stock }],
    ...(p.bundleOf ? { bundleItems: p.bundleOf.map((b) => b.itemProduct) } : {}),
  };
}

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const params = await props.params;
  const p = await prisma.shopProduct.findUnique({ where: { slug: params.slug } });
  if (!p) return { title: "Product niet gevonden — ZekerFlex Shop" };
  const title = `${p.name} — ZekerFlex Shop`;
  const description = p.description.slice(0, 160);
  return {
    title,
    description,
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
    },
  });
  if (!product || !product.active) notFound();

  // "Vaak samen gekocht" from real orders first, topped up from the same category.
  const togetherIds = await boughtTogether(product.id, 4).catch(() => [] as string[]);
  const together = togetherIds.length
    ? (await prisma.shopProduct.findMany({ where: { id: { in: togetherIds }, active: true } })).sort((a, b) => togetherIds.indexOf(a.id) - togetherIds.indexOf(b.id))
    : [];
  const fill = await prisma.shopProduct.findMany({
    where: { active: true, category: product.category, id: { notIn: [product.id, ...together.map((p) => p.id)] } },
    orderBy: { sortOrder: "asc" },
    take: Math.max(0, 4 - together.length),
  });
  const related = [...together, ...fill];

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
            }),
          ),
        }}
      />
      <ProductDetail product={toDto(product)} related={related.map(toDto)} boughtTogether={together.length > 0} />
    </>
  );
}
