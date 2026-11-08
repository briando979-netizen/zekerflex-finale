import { z } from "zod";

export const segmentSchema = z.object({
  name: z.string(),
  discount: z.number().min(0).max(1),
  volume: z.number().positive(),
});

export async function createBundleStrategy(products: { id: string; price: number }[]) {
  const bundlePrice = products.reduce((sum, p) => sum + p.price, 0) * 0.85;
  return { bundlePrice, discount: 0.15, items: products.length };
}

export async function segmentedPricing(segments: z.infer<typeof segmentSchema>[]) {
  return segments.map(s => ({
    segment: s.name,
    adjustedPrice: s.volume > 100 ? s.discount * 2 : s.discount,
    volumeBonus: s.volume * 0.01,
  }));
}

export async function discountOptimization(basePrice: number, targets: { segment: string; target: number }[]) {
  return targets.map(t => ({
    segment: t.segment,
    requiredDiscount: Math.max(0, (basePrice - t.target) / basePrice),
    finalPrice: Math.min(basePrice, t.target),
  }));
}
