import { VatTreatment } from "@prisma/client";
import { env } from "@/lib/env";
import type {
  ComputedInvoice,
  InvoiceLineInput,
  ReverseBillingResult,
} from "@/types/billing";

export interface ReverseBillingInput {
  timesheetId: string;
  billableMinutes: number;
  hourlyRateCents: number;
  /** Freelancer being paid; issuer of the self-billed services invoice. */
  freelancerId: string;
  freelancerCountry: string; // ISO 3166-1 alpha-2
  freelancerVatValid: boolean;
  /** Tenant that receives (and settles) both invoices. */
  recipientTenantId: string;
  recipientCountry: string;
  /** Platform tenant issuing the fee invoice. */
  platformTenantId: string;
  shiftTitle: string;
  workedOn: Date;
  /** Sequential invoice numbers, pre-reserved by the caller within a txn. */
  freelancerInvoiceNumber: string;
  platformInvoiceNumber: string;
}

const round = (n: number) => Math.round(n);

function lineTotal(line: InvoiceLineInput): number {
  return round(line.quantityHours * line.unitPriceCents);
}

/**
 * Determine VAT treatment for a cross-party invoice. Domestic NL B2B uses the
 * standard rate; intra-EU B2B with a valid VAT id shifts to reverse charge;
 * anything else is treated as out of scope and must be reviewed manually
 * upstream (we still emit the invoice at 0%).
 */
function resolveVat(
  issuerCountry: string,
  recipientCountry: string,
  recipientVatValidForReverseCharge: boolean,
): { treatment: VatTreatment; rate: number } {
  if (issuerCountry === "NL" && recipientCountry === "NL") {
    return { treatment: VatTreatment.STANDARD_RATE, rate: env.VAT_RATE_STANDARD };
  }
  if (
    issuerCountry !== recipientCountry &&
    recipientVatValidForReverseCharge
  ) {
    return { treatment: VatTreatment.REVERSE_CHARGE, rate: 0 };
  }
  return { treatment: VatTreatment.OUT_OF_SCOPE, rate: 0 };
}

function assemble(
  base: Pick<
    ComputedInvoice,
    "type" | "number" | "recipientTenantId" | "timesheetId"
  > & {
    issuerFreelancerId?: string;
    issuerTenantId?: string;
  },
  lines: InvoiceLineInput[],
  vat: { treatment: VatTreatment; rate: number },
): ComputedInvoice {
  const withAmounts = lines.map((l) => ({ ...l, amountCents: lineTotal(l) }));
  const subtotalCents = withAmounts.reduce((s, l) => s + l.amountCents, 0);
  const vatCents = round(subtotalCents * vat.rate);
  return {
    ...base,
    vatTreatment: vat.treatment,
    vatRate: vat.rate,
    lines: withAmounts,
    subtotalCents,
    vatCents,
    totalCents: subtotalCents + vatCents,
  };
}

/**
 * Build the two invoices produced when a client approves a timesheet:
 *
 *  1. SELF_BILL_FREELANCER - services rendered, issued on the freelancer's
 *     behalf, payable by the client tenant to the freelancer.
 *  2. PLATFORM_FEE - ZekerFlex's fee on the gross, payable by the client tenant
 *     to the platform.
 *
 * The freelancer's net payout is the services invoice total (they receive the
 * VAT too and remit it themselves) - the platform fee is billed separately to
 * the client and never deducted from the worker.
 */
export function buildReverseBillingInvoices(
  input: ReverseBillingInput,
): ReverseBillingResult {
  const hours = input.billableMinutes / 60;

  const servicesVat = resolveVat(
    input.freelancerCountry,
    input.recipientCountry,
    // reverse charge only applies when the *recipient* can account for VAT;
    // proxied here by the freelancer's own VIES validity in the same market.
    input.freelancerVatValid,
  );

  const freelancerInvoice = assemble(
    {
      type: "SELF_BILL_FREELANCER",
      number: input.freelancerInvoiceNumber,
      timesheetId: input.timesheetId,
      recipientTenantId: input.recipientTenantId,
      issuerFreelancerId: input.freelancerId,
    },
    [
      {
        description: `${input.shiftTitle} - ${input.workedOn
          .toISOString()
          .slice(0, 10)}`,
        quantityHours: Number(hours.toFixed(2)),
        unitPriceCents: input.hourlyRateCents,
      },
    ],
    servicesVat,
  );

  // Employer platform fee: a flat amount per billable hour (e.g. EUR 3,50/uur),
  // billed to the client, never deducted from the freelancer.
  const feePerHourCents = env.PLATFORM_FEE_PER_HOUR_CENTS;
  const feeVat = resolveVat("NL", input.recipientCountry, input.freelancerVatValid);

  const platformFeeInvoice = assemble(
    {
      type: "PLATFORM_FEE",
      number: input.platformInvoiceNumber,
      timesheetId: input.timesheetId,
      recipientTenantId: input.recipientTenantId,
      issuerTenantId: input.platformTenantId,
    },
    [
      {
        description: `ZekerFlex platformkosten (€ ${(feePerHourCents / 100)
          .toFixed(2)
          .replace(".", ",")} per gewerkt uur) — ${input.shiftTitle}`,
        quantityHours: Number(hours.toFixed(2)),
        unitPriceCents: feePerHourCents,
      },
    ],
    feeVat,
  );

  return {
    freelancerInvoice,
    platformFeeInvoice,
    freelancerPayoutCents: freelancerInvoice.totalCents,
  };
}
