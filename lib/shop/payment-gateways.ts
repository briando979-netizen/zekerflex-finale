// Multiple payment gateway integrations

export type PaymentGateway = "stripe" | "mollie" | "adyen" | "paypal" | "klarna";

export interface PaymentMethod {
  id: string;
  gateway: PaymentGateway;
  type: "card" | "bank" | "wallet" | "bnpl";
  displayName: string;
  enabled: boolean;
  config: Record<string, string>;
}

export interface PaymentProvider {
  name: string;
  gateway: PaymentGateway;
  fees: {
    percentage: number;
    fixed: number; // cents
  };
  supportedCountries: string[];
  supportsSubscriptions: boolean;
  supportsRefunds: boolean;
}

export const PAYMENT_PROVIDERS: PaymentProvider[] = [
  {
    name: "Stripe",
    gateway: "stripe",
    fees: { percentage: 1.4, fixed: 29 },
    supportedCountries: ["NL", "BE", "FR", "DE", "GB", "ES", "IT", "AT", "CH"],
    supportsSubscriptions: true,
    supportsRefunds: true,
  },
  {
    name: "Mollie",
    gateway: "mollie",
    fees: { percentage: 2.0, fixed: 0 },
    supportedCountries: ["NL", "BE", "DE", "AT", "FR", "IT", "ES", "GB"],
    supportsSubscriptions: true,
    supportsRefunds: true,
  },
  {
    name: "Adyen",
    gateway: "adyen",
    fees: { percentage: 1.5, fixed: 0 },
    supportedCountries: ["NL", "BE", "DE", "AT", "FR", "IT", "ES", "GB", "CH"],
    supportsSubscriptions: true,
    supportsRefunds: true,
  },
  {
    name: "PayPal",
    gateway: "paypal",
    fees: { percentage: 2.49, fixed: 49 },
    supportedCountries: ["NL", "BE", "DE", "AT", "FR", "IT", "ES", "GB"],
    supportsSubscriptions: false,
    supportsRefunds: true,
  },
  {
    name: "Klarna",
    gateway: "klarna",
    fees: { percentage: 5.0, fixed: 0 },
    supportedCountries: ["NL", "BE", "DE", "AT", "FR", "SE", "NO", "DK"],
    supportsSubscriptions: false,
    supportsRefunds: true,
  },
];

export async function getAvailablePaymentMethods(country: string): Promise<PaymentMethod[]> {
  // TODO: Filter by country and enabled status
  return [];
}

export function calculateGatewayFees(amountCents: number, gateway: PaymentGateway): number {
  const provider = PAYMENT_PROVIDERS.find((p) => p.gateway === gateway);
  if (!provider) return 0;
  return Math.round((amountCents * provider.fees.percentage) / 100) + provider.fees.fixed;
}

export async function processPayment(
  gateway: PaymentGateway,
  amountCents: number,
  currency: string,
  metadata: Record<string, any>
): Promise<string> {
  // TODO: Route to appropriate gateway implementation
  return `payment_${Date.now()}`;
}
