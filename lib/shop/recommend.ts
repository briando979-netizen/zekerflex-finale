import { prisma } from "@/lib/prisma";

// "Vaak samen gekocht": products that appear in the same paid orders as this
// one, most frequent first — computed from real orders, no guessing.
export async function boughtTogether(productId: string, limit = 4): Promise<string[]> {
  const orders = await prisma.shopOrder.findMany({
    where: { status: { in: ["RECEIVED", "CONFIRMED", "SHIPPED"] } },
    select: { itemsJson: true },
    orderBy: { createdAt: "desc" },
    take: 2000,
  });
  const counts = new Map<string, number>();
  for (const o of orders) {
    const ids = new Set(((o.itemsJson as { productId?: string }[] | null) ?? []).map((l) => l.productId).filter((x): x is string => Boolean(x)));
    if (!ids.has(productId)) continue;
    for (const id of ids) if (id !== productId) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([id]) => id);
}
