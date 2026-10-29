import { prisma } from "@/lib/prisma";
import { proposeIntent, type PaymentIntent } from "./intents";

// Regelgebaseerde voorsteller: kijkt naar ECHTE data (lage webshopvoorraad) en
// stelt bijbestellingen voor. Bewust geen vrije-tekst-LLM die bedragen/ontvangers
// verzint — alle cijfers komen uit de database. De voorstellen landen als PENDING
// en gaan pas door na jouw goedkeuring (en pas echt geld als er een rail aan is).
const LOW_STOCK = 5;
const REORDER_QTY = 20;

/** Inkoopprijs per stuk: echte COGS, anders helft van de verkoopprijs. */
export function restockUnitCents(costCents: number | null, priceCents: number): number {
  return costCents && costCents > 0 ? costCents : Math.max(1, Math.round(priceCents / 2));
}

export async function proposeRestocks(): Promise<PaymentIntent[]> {
  const products = await prisma.shopProduct.findMany({
    where: { active: true, isBundle: false, stock: { lt: LOW_STOCK } },
    orderBy: { stock: "asc" },
    take: 20,
    select: { name: true, stock: true, costCents: true, priceCents: true },
  });
  return products.map((p) => {
    const unit = restockUnitCents(p.costCents, p.priceCents);
    return proposeIntent({
      amountCents: unit * REORDER_QTY,
      recipient: `Leverancier — ${p.name}`,
      external: true,
      reason: `Voorraad "${p.name}" is ${p.stock} (onder ${LOW_STOCK}); ${REORDER_QTY} bijbestellen à € ${(unit / 100).toFixed(2).replace(".", ",")} per stuk.`,
      proposedBy: "ai",
    });
  });
}
