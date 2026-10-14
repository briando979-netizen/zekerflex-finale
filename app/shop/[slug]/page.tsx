import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { canonical, productJsonLd } from "@/lib/seo";
import { ProductDetail, type PdpProduct } from "@/components/marketing/ProductDetail";

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

  const related = await prisma.shopProduct.findMany({
    where: { active: true, category: product.category, id: { not: product.id } },
    orderBy: { sortOrder: "asc" },
    take: 4,
  });

  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
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
      <ProductDetail product={toDto(product)} related={related.map(toDto)} />
    </>
  );
}
