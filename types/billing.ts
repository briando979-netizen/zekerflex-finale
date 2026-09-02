import type {
  InvoiceType,
  PaymentStatus,
  VatTreatment,
} from "@prisma/client";

export interface Money {
  cents: number;
  currency: "EUR";
}

export interface InvoiceLineInput {
  description: string;
  quantityHours: number;
  unitPriceCents: number;
}

export interface ComputedInvoice {
  type: InvoiceType;
  number: string;
  timesheetId: string;
  vatTreatment: VatTreatment;
  vatRate: number;
  lines: (InvoiceLineInput & { amountCents: number })[];
  subtotalCents: number;
  vatCents: number;
  totalCents: number;
  issuerFreelancerId?: string;
  issuerTenantId?: string;
  recipientTenantId: string;
}

export interface ReverseBillingResult {
  freelancerInvoice: ComputedInvoice;
  platformFeeInvoice: ComputedInvoice;
  /** Net amount to be paid out to the freelancer via instant SEPA. */
  freelancerPayoutCents: number;
}

export interface SepaInstantPayoutRequest {
  endToEndId: string; // idempotency key
  amountCents: number;
  currency: "EUR";
  creditorIban: string;
  creditorName: string;
  remittanceInfo: string; // <=140 chars, appears on the bank statement
}

export interface SepaInstantPayoutResult {
  status: PaymentStatus;
  providerRef: string | null;
  acceptedAt: string | null;
  failureCode?: string;
}
