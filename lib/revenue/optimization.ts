export async function optimizePrice(params: {
  cost: number;
  demand: number;
  competition: number;
  targetMargin: number;
}) {
  const minPrice = params.cost / (1 - params.targetMargin);
  const demandPrice = params.cost + (params.cost * params.demand * 0.5);
  const competitivePrice = params.competition * 0.95;
  
  return {
    minimumPrice: minPrice,
    optimalPrice: Math.max(minPrice, Math.min(demandPrice, competitivePrice)),
    projectedMargin: (Math.min(demandPrice, competitivePrice) - params.cost) / Math.min(demandPrice, competitivePrice),
  };
}

export async function volumeOptimization(price: number, elasticity: number = -1.5) {
  const baseVolume = 1000;
  return {
    price,
    volume: baseVolume * Math.pow(price / 100, elasticity),
    revenue: price * baseVolume * Math.pow(price / 100, elasticity),
  };
}

export async function marketShareOptimization(share: number, competitors: number) {
  const priceAdjustment = (share - 20) / 100;
  return { adjustedPrice: 1 + priceAdjustment, shareGain: priceAdjustment * 10 };
}
