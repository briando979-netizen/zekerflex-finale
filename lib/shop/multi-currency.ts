// Multi-currency support for international customers

export type Currency = "EUR" | "USD" | "GBP" | "CHF";

export const CURRENCIES: Record<Currency, { symbol: string; code: string; name: string }> = {
  EUR: { symbol: "€", code: "eur", name: "Euro" },
  USD: { symbol: "$", code: "usd", name: "US Dollar" },
  GBP: { symbol: "£", code: "gbp", name: "British Pound" },
  CHF: { symbol: "CHF", code: "chf", name: "Swiss Franc" },
};

export interface ExchangeRates {
  base: Currency;
  rates: Record<Currency, number>;
  updatedAt: Date;
}

// Example rates (would fetch from API in production)
export const CURRENT_RATES: ExchangeRates = {
  base: "EUR",
  rates: {
    EUR: 1.0,
    USD: 1.11,
    GBP: 0.86,
    CHF: 0.98,
  },
  updatedAt: new Date(),
};

export function convertCurrency(
  amountCents: number,
  fromCurrency: Currency,
  toCurrency: Currency,
  rates: ExchangeRates = CURRENT_RATES
): number {
  if (fromCurrency === toCurrency) return amountCents;

  const rate = rates.rates[toCurrency] / rates.rates[fromCurrency];
  return Math.round(amountCents * rate);
}

export function formatPrice(amountCents: number, currency: Currency): string {
  const curr = CURRENCIES[currency];
  const amount = (amountCents / 100).toFixed(2);

  if (currency === "USD" || currency === "GBP") {
    return `${curr.symbol}${amount}`;
  }
  return `${amount} ${curr.symbol}`;
}

export function detectCurrencyFromLocale(locale: string): Currency {
  const countryMap: Record<string, Currency> = {
    NL: "EUR",
    BE: "EUR",
    FR: "EUR",
    DE: "EUR",
    US: "USD",
    GB: "GBP",
    CH: "CHF",
  };

  const country = locale.split("-")[1]?.toUpperCase();
  return (country && countryMap[country]) || "EUR";
}
