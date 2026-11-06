// B2B features and enterprise selling

export interface B2BAccount {
  id: string;
  companyName: string;
  taxNumber: string;
  contactEmail: string;
  billingEmail: string;
  creditLimit: number; // cents
  creditUsed: number; // cents
  paymentTerms: "NET15" | "NET30" | "NET60" | "COD";
  accountManager?: string;
  customPricing: boolean;
  bulkDiscounts: BulkDiscount[];
  status: "active" | "pending" | "suspended";
}

export interface BulkDiscount {
  minQuantity: number;
  discount: number; // percentage
}

export interface QuoteRequest {
  id: string;
  accountId: string;
  items: QuoteItem[];
  validUntil: Date;
  status: "draft" | "sent" | "accepted" | "rejected" | "expired";
  notes?: string;
}

export interface QuoteItem {
  productId: string;
  quantity: number;
  pricePerUnit: number; // cents
}

export async function createB2BAccount(data: Partial<B2BAccount>): Promise<B2BAccount> {
  return {
    id: `b2b_${Date.now()}`,
    companyName: data.companyName || "",
    taxNumber: data.taxNumber || "",
    contactEmail: data.contactEmail || "",
    billingEmail: data.billingEmail || "",
    creditLimit: data.creditLimit || 100000000, // €1M default
    creditUsed: 0,
    paymentTerms: "NET30",
    customPricing: false,
    bulkDiscounts: [],
    status: "pending",
    ...data,
  };
}

export async function generateQuote(accountId: string, items: QuoteItem[]): Promise<QuoteRequest> {
  return {
    id: `quote_${Date.now()}`,
    accountId,
    items,
    validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    status: "draft",
  };
}

export function calculateB2BPrice(
  basePriceCents: number,
  quantity: number,
  account: B2BAccount
): number {
  let price = basePriceCents;

  // Apply bulk discount
  const applicableDiscount = account.bulkDiscounts.find(
    (d) => quantity >= d.minQuantity
  );
  if (applicableDiscount) {
    price = Math.floor((price * (100 - applicableDiscount.discount)) / 100);
  }

  return price * quantity;
}

export async function getAccountCredit(accountId: string): Promise<number> {
  // TODO: Fetch from database
  return 0;
}
