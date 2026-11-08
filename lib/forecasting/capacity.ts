export function forecastCapacity(
  currentCapacity: number,
  historicalGrowth: number[],
  months: number = 12
) {
  const avgGrowth = historicalGrowth.reduce((a, b) => a + b, 0) / historicalGrowth.length;
  const capacityNeeded = [];
  const bottlenecks = [];
  const recommendedExpansion = [];

  for (let i = 0; i < months; i++) {
    const needed = Math.round(currentCapacity * Math.pow(1 + avgGrowth, i));
    capacityNeeded.push(needed);
    
    if (needed > currentCapacity * 0.9) {
      bottlenecks.push({
        month: i,
        severity: needed > currentCapacity ? "critical" : "warning",
      });
    }

    if (needed > currentCapacity * 0.8) {
      recommendedExpansion.push({
        month: i,
        capacityIncrease: Math.round(needed * 1.2 - currentCapacity),
      });
    }
  }

  return { capacityNeeded, bottlenecks, recommendedExpansion };
}
