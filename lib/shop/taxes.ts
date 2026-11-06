// Tax and VAT handling

export interface TaxRate {
  country: string;
  region?: string;
  rate: number; // percentage
  type: "standard" | "reduced" | "zero";
  appliesTo?: string[]; // product categories
}

export interface TaxCalculation {
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  rate: number;
}

// Standard EU VAT rates
export const TAX_RATES: TaxRate[] = [
  { country: "NL", rate: 21, type: "standard" },
  { country: "NL", rate: 6, type: "reduced", appliesTo: ["books", "food"] },
  { country: "NL", rate: 0, type: "zero", appliesTo: ["export"] },
  { country: "BE", rate: 21, type: "standard" },
  { country: "FR", rate: 20, type: "standard" },
  { country: "DE", rate: 19, type: "standard" },
  { country: "GB", rate: 20, type: "standard" },
];

export function getTaxRate(country: string, category?: string): number {
  const applicable = TAX_RATES.filter((t) => t.country === country);
  if (category) {
    const withCategory = applicable.find((t) => t.appliesTo?.includes(category));
    if (withCategory) return withCategory.rate;
  }
  return applicable.find((t) => t.type === "standard")?.rate || 21;
}

export function calculateTax(subtotalCents: number, taxRate: number): TaxCalculation {
  const taxCents = Math.round((subtotalCents * taxRate) / 100);
  return {
    subtotalCents,
    taxCents,
    totalCents: subtotalCents + taxCents,
    rate: taxRate,
  };
}

export async function validateVATNumber(vatNumber: string): Promise<boolean> {
  // TODO: Call VIES API to validate
  return true;
}

export function isVATExempt(country: string): boolean {
  // Some countries/customers might be exempt
  return false;
}
