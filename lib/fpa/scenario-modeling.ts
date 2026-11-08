import { z } from "zod";

const scenarioSchema = z.object({
  baseRevenue: z.number(),
  baseExpense: z.number(),
  variables: z.record(z.object({
    min: z.number(),
    max: z.number(),
    distribution: z.enum(["uniform", "normal"]),
  })),
  iterations: z.number().default(1000),
});

export function runMonteCarloSimulation(input: z.infer<typeof scenarioSchema>) {
  const validated = scenarioSchema.parse(input);
  const results = [];

  for (let i = 0; i < validated.iterations; i++) {
    const variables: Record<string, number> = {};

    for (const [key, config] of Object.entries(validated.variables)) {
      if (config.distribution === "uniform") {
        variables[key] = Math.random() * (config.max - config.min) + config.min;
      } else {
        // Normal distribution approximation
        let u = 0;
        for (let j = 0; j < 6; j++) {
          u += Math.random();
        }
        const z = (u - 3) * 0.5;
        variables[key] = config.min + ((config.max - config.min) / 2) + z * ((config.max - config.min) / 6);
      }
    }

    const revenue = validated.baseRevenue * (1 + (variables.revenueGrowth || 0));
    const expense = validated.baseExpense * (1 + (variables.expenseGrowth || 0));
    const profit = revenue - expense;

    results.push({
      revenue,
      expense,
      profit,
      margin: (profit / revenue) * 100,
      variables,
    });
  }

  return analyzeResults(results);
}

function analyzeResults(results: any[]) {
  const revenues = results.map(r => r.revenue).sort((a, b) => a - b);
  const expenses = results.map(r => r.expense).sort((a, b) => a - b);
  const profits = results.map(r => r.profit).sort((a, b) => a - b);

  const percentile = (arr: number[], p: number) => arr[Math.floor(arr.length * p)];

  return {
    revenue: {
      mean: revenues.reduce((a, b) => a + b) / revenues.length,
      p10: percentile(revenues, 0.1),
      p50: percentile(revenues, 0.5),
      p90: percentile(revenues, 0.9),
    },
    expense: {
      mean: expenses.reduce((a, b) => a + b) / expenses.length,
      p10: percentile(expenses, 0.1),
      p50: percentile(expenses, 0.5),
      p90: percentile(expenses, 0.9),
    },
    profit: {
      mean: profits.reduce((a, b) => a + b) / profits.length,
      p10: percentile(profits, 0.1),
      p50: percentile(profits, 0.5),
      p90: percentile(profits, 0.9),
    },
  };
}

export function sensitivityAnalysis(baseRevenue: number, baseExpense: number, variables: string[]) {
  const results: Record<string, number> = {};

  variables.forEach(variable => {
    const upside = baseRevenue * 1.1 - baseExpense;
    const downside = baseRevenue * 0.9 - baseExpense;
    results[variable] = upside - downside;
  });

  return results;
}
