// Saved payment methods

export type PaymentMethodType = "card" | "bank_account" | "digital_wallet";
export type CardBrand = "visa" | "mastercard" | "amex" | "discover";

export interface SavedCard {
  id: string;
  brand: CardBrand;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
  zipCode: string;
  isDefault: boolean;
  stripePaymentMethodId: string;
}

export interface SavedBankAccount {
  id: string;
  last4: string;
  bankName: string;
  accountHolder: string;
  isDefault: boolean;
  stripePaymentMethodId: string;
}

export type SavedPaymentMethod = SavedCard | SavedBankAccount;

export function isExpired(card: SavedCard): boolean {
  const now = new Date();
  const expiry = new Date(card.expiryYear, card.expiryMonth - 1);
  return now > expiry;
}

export function maskCard(card: SavedCard): string {
  return `${card.brand.toUpperCase()} •••• ${card.last4}`;
}

export function maskBankAccount(account: SavedBankAccount): string {
  return `${account.bankName} •••• ${account.last4}`;
}

export async function addPaymentMethod(
  stripeCustomerId: string,
  paymentMethodId: string
): Promise<SavedPaymentMethod | null> {
  // TODO: Call Stripe API to attach payment method
  return null;
}

export async function removePaymentMethod(paymentMethodId: string) {
  // TODO: Call Stripe API to detach payment method
}

export async function setDefaultPaymentMethod(customerId: string, paymentMethodId: string) {
  // TODO: Update customer default payment method in Stripe
}
