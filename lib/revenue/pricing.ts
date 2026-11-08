import { prisma } from "@/lib/prisma";
import { z } from "zod";

const pricingStrategySchema = z.object({
  productId: z.string(),
  basPrice: z.number().positive(),
  demandMultiplier: z.number().min(0.5).max(2),
  competitorPrice: z.number().positive().optional(),
  seasonalFactor: z.number().min(0.8).max(1.5),
  marketShare: z.number().min(0).max(100),
});

export async function calculateDynamicPrice(input: z.infer<typeof pricingStrategySchema>) {
  const schema = pricingStrategySchema.parse(input);
  const demand = schema.demandMultiplier;
  const seasonal = schema.seasonalFactor;
  const competitive = schema.competitorPrice ? Math.min(schema.competitorPrice * 0.95, schema.basPrice * 1.1) : schema.basPrice;

  const optimized = schema.basPrice * demand * seasonal * (1 + (schema.marketShare - 50) / 100);
  return Math.min(optimized, competitive * 1.2);
}

export async function getPricingStrategy(productId: string) {
  return await prisma.pricingStrategy.findUnique({
    where: { productId },
    include: { history: { take: 10, orderBy: { createdAt: "desc" } } },
  });
}

export async function updatePricingStrategy(productId: string, updates: Partial<z.infer<typeof pricingStrategySchema>>) {
  const newPrice = updates.basPrice || updates.demandMultiplier ?
    await calculateDynamicPrice({...updates, productId, basPrice: updates.basPrice || 0}) : undefined;

  return await prisma.pricingStrategy.upsert({
    where: { productId },
    create: { productId, ...updates, optimizedPrice: newPrice || 0 },
    update: { ...updates, optimizedPrice: newPrice, lastUpdated: new Date() },
  });
}
