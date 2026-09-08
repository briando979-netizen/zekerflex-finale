import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ProductDetail, type PdpProduct } from "@/components/marketing/ProductDetail";

export const dynamic = "force-dynamic";

function toDto(p: {
  id: string; slug: string; name: string; description: string; category: string;
  priceCents: number; stock: number; imageUrl: string | null; modelPhotoUrl: string | null; badge: string | null;
}): PdpProduct {
  return {
    id: p.id, slug: p.slug, name: p.name, description: p.description, category: p.category,
    priceCents: p.priceCents, stock: p.stock, imageUrl: p.imageUrl, modelPhotoUrl: p.modelPhotoUrl, badge: p.badge,
  };
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const p = await prisma.shopProduct.findUnique({ where: { slug: params.slug } });
  if (!p) return { title: "Product niet gevonden — ZekerFlex Shop" };
  return {
    title: `${p.name} — ZekerFlex Shop`,
    description: p.description.slice(0, 160),
    alternates: { canonical: `/shop/${p.slug}` },
  };
}

export default async function ProductPage({ params }: { params: { slug: string } }) {
  const product = await prisma.shopProduct.findUnique({ where: { slug: params.slug } });
  if (!product || !product.active) notFound();

  const related = await prisma.shopProduct.findMany({
    where: { active: true, category: product.category, id: { not: product.id } },
    orderBy: { sortOrder: "asc" },
    take: 4,
  });

  return <ProductDetail product={toDto(product)} related={related.map(toDto)} />;
}
