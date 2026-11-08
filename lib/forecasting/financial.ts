export interface FinancialForecast {
  revenue: number[];
  expenses: number[];
  cashFlow: number[];
  profitMargin: number[];
  budgetVariance: number[];
}

export function forecastFinancials(
  historicalRevenue: number[],
  historicalExpenses: number[],
  months: number = 12
): FinancialForecast {
  const avgRevenueGrowth = 0.06;
  const avgExpenseGrowth = 0.04;
  const baseRevenue = historicalRevenue[historicalRevenue.length - 1] || 100000;
  const baseExpenses = historicalExpenses[historicalExpenses.length - 1] || 50000;

  const revenue = [];
  const expenses = [];
  const cashFlow = [];
  const profitMargin = [];
  const budgetVariance = [];

  for (let i = 0; i < months; i++) {
    const rev = Math.round(baseRevenue * Math.pow(1 + avgRevenueGrowth, i));
    const exp = Math.round(baseExpenses * Math.pow(1 + avgExpenseGrowth, i));
    const cf = rev - exp;
    const margin = (cf / rev) * 100;
    
    revenue.push(rev);
    expenses.push(exp);
    cashFlow.push(cf);
    profitMargin.push(margin);
    budgetVariance.push((Math.random() - 0.5) * 1000);
  }

  return { revenue, expenses, cashFlow, profitMargin, budgetVariance };
}
