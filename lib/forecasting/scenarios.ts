export interface Scenario {
  name: string;
  parameters: Record<string, number>;
  results: Record<string, number[]>;
}

export function runScenarioAnalysis(
  baselineRevenue: number,
  baselineExpenses: number,
  scenarios: Array<{ name: string; revenueMultiplier: number; expenseMultiplier: number }>,
  months: number = 12
): Scenario[] {
  return scenarios.map((scenario) => {
    const results: Record<string, number[]> = {
      revenue: [],
      expenses: [],
      netIncome: [],
    };

    for (let i = 0; i < months; i++) {
      const revenue = Math.round(baselineRevenue * scenario.revenueMultiplier * (1 + 0.06) ** i);
      const expenses = Math.round(baselineExpenses * scenario.expenseMultiplier * (1 + 0.04) ** i);
      const netIncome = revenue - expenses;

      results.revenue.push(revenue);
      results.expenses.push(expenses);
      results.netIncome.push(netIncome);
    }

    return { name: scenario.name, parameters: scenario, results };
  });
}

export function sensitivityAnalysis(base: number, parameter: string, rangePercent: number = 20) {
  const variations = [];
  for (let i = -rangePercent; i <= rangePercent; i += 5) {
    const multiplier = 1 + i / 100;
    variations.push({ [parameter]: Math.round(base * multiplier), impact: i });
  }
  return variations;
}
