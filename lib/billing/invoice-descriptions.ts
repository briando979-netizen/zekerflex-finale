import { InvoiceType } from "@prisma/client";

/** Line description shown on the Stripe Checkout page for an invoice. */
export const INVOICE_CHECKOUT_DESCRIPTION: Record<InvoiceType, string> = {
  [InvoiceType.PLATFORM_FEE]: "ZekerFlex platformfee",
  [InvoiceType.SELF_BILL_FREELANCER]: "ZekerFlex dienst (zzp)",
  [InvoiceType.CANCELLATION_PENALTY]: "ZekerFlex annuleringsvergoeding",
  [InvoiceType.UITZEND_FEE]: "ZekerFlex uitzendkracht (loon + opslag)",
};
