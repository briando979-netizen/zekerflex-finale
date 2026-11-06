// Gift cards and store credit

export interface GiftCard {
  id: string;
  code: string;
  amountCents: number;
  balanceCents: number;
  purchasedBy?: string;
  claimedBy?: string;
  expiresAt?: Date;
  status: "active" | "claimed" | "expired" | "revoked";
  createdAt: Date;
}

export interface GiftCardTransaction {
  id: string;
  giftCardId: string;
  orderId?: string;
  amountCents: number;
  type: "purchase" | "redeem" | "refund";
  createdAt: Date;
}

export async function generateGiftCard(amountCents: number, expiryDays?: number): Promise<GiftCard> {
  const code = generateGiftCardCode();
  return {
    id: `giftcard_${Date.now()}`,
    code,
    amountCents,
    balanceCents: amountCents,
    status: "active",
    expiresAt: expiryDays ? new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000) : undefined,
    createdAt: new Date(),
  };
}

export async function redeemGiftCard(code: string, orderId: string, amountCents: number): Promise<GiftCard | null> {
  // TODO: Validate code, check balance, update balance
  return null;
}

export async function getGiftCardBalance(code: string): Promise<number> {
  // TODO: Fetch from database
  return 0;
}

export function generateGiftCardCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 16; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code.match(/.{1,4}/g)?.join("-") || code;
}
