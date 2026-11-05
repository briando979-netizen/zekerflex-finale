import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { canonical } from "@/lib/seo";
import { getDict } from "@/lib/i18n/server";
import { Paskamer } from "@/components/marketing/paskamer/Paskamer";
import { LOOKS, toPaskamerProduct, type PaskamerProduct } from "@/lib/shop/paskamer";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = (await getDict()).paskamer;
  return { title: t.metaTitel, description: t.metaOmschrijving, ...canonical("/shop/paskamer", { title: t.metaTitel, description: t.metaOmschrijving }) };
}

// De paskamer: alle draagbare, koopbare producten (ook van verkopers) gaan als
// klein paskamerproduct naar de browser; de rest (prijzen herberekenen,
// voorraad) blijft bij het afrekenen op de server.
export default async function PaskamerPage(props: { searchParams: Promise<{ pas?: string }> }) {
  const { pas } = await props.searchParams;
  const rows = await prisma.shopProduct
    .findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true, slug: true, name: true, priceCents: true, imageUrl: true, gender: true,
        seller: { select: { name: true } },
        variants: { orderBy: { createdAt: "asc" }, select: { id: true, size: true, color: true, priceCents: true, stock: true } },
      },
    })
    .catch(() => []);
  const producten = rows.map(toPaskamerProduct).filter((p): p is PaskamerProduct => p !== null);
  const slugs = new Set(producten.map((p) => p.slug));
  // een look laten we alleen zien als er minstens twee stukken van leverbaar zijn
  const looks = LOOKS.filter((l) => l.slugs.filter((s) => slugs.has(s)).length >= 2);
  const start = typeof pas === "string" && /^[a-z0-9-]{1,120}$/.test(pas) ? pas : null;
  return <Paskamer producten={producten} looks={looks} start={start} />;
}
