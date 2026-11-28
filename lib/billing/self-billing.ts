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
  /**
   * De werker gebruikt de kleineondernemersregeling (lib/fiscal/bedrijf-ok.ts, korZonderBtw): een Nederlandse werker met de
   * KOR rekent geen btw, en de factuur op zijn naam zegt waarom (KOR_VERMELDING). Zonder: de gewone btw-regels hieronder.
   */
  freelancerKor?: boolean;
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
  /** "Extra kosten factureren" — VAT-inclusive amount the freelancer entered on submit. */
  extraCostsGrossCents?: number | null;
  extraCostsNote?: string | null;
  /** Staffelkorting: the client's fee per hour this month (lib/pricing/volume.ts); default = full fee. */
  platformFeePerHourCents?: number;
  /** Tier name shown on the invoice line when discounted. */
  volumeTierName?: string;
  /** Waarom de platformkosten € 0 zijn, op de factuurregel (bv. de twee weken na een introductie, lib/introducties/periode.ts). */
  platformFeeReden?: string | undefined;
}

const round = (n: number) => Math.round(n);

/**
 * De vermelding op de factuur van een werker met de KOR (21 nov 2026): geen btw, en waarom. Staat achter de eerste regel; de
 * pdf (lib/pdf/documents.ts) herkent er de factuur aan en zet "Btw (vrijgesteld, KOR)" in plaats van "Buiten reikwijdte btw".
 */
export const KOR_VERMELDING = "vrijgesteld van btw op grond van de kleineondernemersregeling (KOR)";

/**
 * De vermelding op de platformfactuur aan een Belgisch bedrijf met een btw-nummer (28 nov 2026, spec-belgie.md 5.1): de btw
 * is verlegd naar de klant, die hem in zijn eigen aangifte voldoet. De tekst is het voorstel uit de specificatie (richtlijn
 * 2006/112/EG en het Belgische Btw-wetboek); laat een Belgische boekhouder hem nakijken voordat de eerste factuur uitgaat.
 */
export const BE_VERLEGD_VERMELDING = "Btw verlegd (verlegging van heffing). Art. 196 richtlijn 2006/112/EG; art. 51, §2 Btw-wetboek.";

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

  // De KOR is een Nederlandse regeling: alleen voor een werker uit Nederland. Geen btw (in de database OUT_OF_SCOPE, er is
  // geen aparte waarde voor "vrijgesteld"), met de vermelding op de regel.
  const kor = Boolean(input.freelancerKor) && input.freelancerCountry === "NL";
  const servicesVat = kor
    ? { treatment: VatTreatment.OUT_OF_SCOPE, rate: 0 }
    : resolveVat(
        input.freelancerCountry,
        input.recipientCountry,
        // reverse charge only applies when the *recipient* can account for VAT;
        // proxied here by the freelancer's own VIES validity in the same market.
        input.freelancerVatValid,
      );

  const serviceLines: InvoiceLineInput[] = [
    {
      description: `${input.shiftTitle} - ${input.workedOn
        .toISOString()
        .slice(0, 10)}${kor ? ` — ${KOR_VERMELDING}` : ""}`,
      quantityHours: Number(hours.toFixed(2)),
      unitPriceCents: input.hourlyRateCents,
    },
  ];

  // "Extra kosten factureren": the freelancer entered a VAT-inclusive amount,
  // but assemble() applies servicesVat.rate to the invoice subtotal, so back
  // the VAT out of the entered gross to land on the same total.
  if (input.extraCostsGrossCents && input.extraCostsGrossCents > 0) {
    const netCents = servicesVat.rate > 0
      ? round(input.extraCostsGrossCents / (1 + servicesVat.rate))
      : input.extraCostsGrossCents;
    serviceLines.push({
      description: `Extra kosten — ${input.extraCostsNote ?? "in overleg met opdrachtgever"}`,
      quantityHours: 1,
      unitPriceCents: netCents,
    });
  }

  const freelancerInvoice = assemble(
    {
      type: "SELF_BILL_FREELANCER",
      number: input.freelancerInvoiceNumber,
      timesheetId: input.timesheetId,
      recipientTenantId: input.recipientTenantId,
      issuerFreelancerId: input.freelancerId,
    },
    serviceLines,
    servicesVat,
  );

  // Employer platform fee: a flat amount per billable hour (e.g. EUR 3,50/uur),
  // billed to the client, never deducted from the freelancer.
  const platformFeeInvoice = buildPlatformFeeInvoice({
    timesheetId: input.timesheetId,
    billableMinutes: input.billableMinutes,
    recipientTenantId: input.recipientTenantId,
    recipientCountry: input.recipientCountry,
    recipientVatValidForReverseCharge: input.freelancerVatValid,
    platformTenantId: input.platformTenantId,
    shiftTitle: input.shiftTitle,
    invoiceNumber: input.platformInvoiceNumber,
    ...(input.platformFeePerHourCents !== undefined ? { platformFeePerHourCents: input.platformFeePerHourCents } : {}),
    ...(input.volumeTierName !== undefined ? { volumeTierName: input.volumeTierName } : {}),
    platformFeeReden: input.platformFeeReden,
  });

  return {
    freelancerInvoice,
    platformFeeInvoice,
    freelancerPayoutCents: freelancerInvoice.totalCents,
  };
}

export interface PlatformFeeInput {
  timesheetId: string;
  billableMinutes: number;
  /** Tenant that receives (and settles) the fee invoice. */
  recipientTenantId: string;
  recipientCountry: string;
  /** Reverse charge alleen als de ontvanger de btw zelf kan verleggen (intra-EU met geldig btw-nummer). */
  recipientVatValidForReverseCharge: boolean;
  platformTenantId: string;
  shiftTitle: string;
  invoiceNumber: string;
  /** Staffelkorting: the client's fee per hour this month (lib/pricing/volume.ts); default = full fee. */
  platformFeePerHourCents?: number;
  volumeTierName?: string;
  platformFeeReden?: string | undefined;
}

/**
 * Alleen de PLATFORM_FEE-factuur: een vast bedrag per gewerkt uur aan het bedrijf. Gebruikt door de twee facturen van het
 * factuurspoor hierboven, en los bij een klus van een uitzendpartner (lib/uitzend/partners-kern.ts): daar is het bureau de
 * werkgever en betaalt het zelf het loon, dus ZekerFlex stuurt alleen deze factuur.
 */
export function buildPlatformFeeInvoice(input: PlatformFeeInput): ComputedInvoice {
  const hours = input.billableMinutes / 60;
  const feePerHourCents = input.platformFeePerHourCents ?? env.PLATFORM_FEE_PER_HOUR_CENTS;
  const discounted = feePerHourCents < env.PLATFORM_FEE_PER_HOUR_CENTS;
  const toelichting = input.platformFeeReden ? `, ${input.platformFeeReden}` : discounted ? `, staffel ${input.volumeTierName ?? "volume"}` : "";
  const feeVat = resolveVat("NL", input.recipientCountry, input.recipientVatValidForReverseCharge);
  // een Belgisch bedrijf met een btw-nummer: de vermelding van de verlegging achter de regel (zoals KOR_VERMELDING), zodat ze
  // op de pdf, de e-factuur en elke lijst staat. Andere landen houden alleen het label "Btw verlegd", zoals altijd.
  const verlegd = feeVat.treatment === VatTreatment.REVERSE_CHARGE && input.recipientCountry.toUpperCase() === "BE" ? ` — ${BE_VERLEGD_VERMELDING}` : "";
  return assemble(
    {
      type: "PLATFORM_FEE",
      number: input.invoiceNumber,
      timesheetId: input.timesheetId,
      recipientTenantId: input.recipientTenantId,
      issuerTenantId: input.platformTenantId,
    },
    [
      {
        description: `ZekerFlex platformkosten (€ ${(feePerHourCents / 100)
          .toFixed(2)
          .replace(".", ",")} per gewerkt uur${toelichting}) — ${input.shiftTitle}${verlegd}`,
        quantityHours: Number(hours.toFixed(2)),
        unitPriceCents: feePerHourCents,
      },
    ],
    feeVat,
  );
}

export interface UitzendInvoiceInput {
  timesheetId: string;
  billableMinutes: number;
  /** Gross hourly wage rate paid to the uitzendkracht via payroll. */
  hourlyRateCents: number;
  recipientTenantId: string;
  recipientCountry: string;
  platformTenantId: string;
  shiftTitle: string;
  workedOn: Date;
  invoiceNumber: string;
  /** Opslag agreed with this client (lib/uitzendbureau/insights.ts); default env.UITZEND_MARKUP_RATE. */
  markupRate?: number;
}

/**
 * Build the single invoice billed to the client for an uitzendkracht shift:
 * gross wage cost + ZekerFlex's uitzendopslag (env.UITZEND_MARKUP_RATE), which
 * covers werkgeverslasten (vakantiegeld, premies) that ZekerFlex pays as the
 * legal employer, plus margin. Unlike the zzp/flexwerker track there is no
 * self-billing freelancer invoice — the worker is paid via the weekly payroll
 * run (lib/payroll/engine.ts), not an instant SEPA payout against an invoice.
 */
export function buildUitzendInvoice(input: UitzendInvoiceInput): ComputedInvoice {
  const hours = input.billableMinutes / 60;
  // Conservative: only the domestic NL-NL case is a known-correct VAT
  // treatment for this track (an uitzendkracht is never VAT-registered, so
  // there's no freelancer-VAT proxy to reuse like the reverse-billing path
  // above does); a cross-border client falls to OUT_OF_SCOPE for manual
  // review rather than guessing at reverse charge.
  const vat = resolveVat("NL", input.recipientCountry, false);

  const wageCents = round(hours * input.hourlyRateCents);
  const markupRate = input.markupRate ?? env.UITZEND_MARKUP_RATE;
  const markupCents = round(wageCents * markupRate);

  return assemble(
    {
      type: "UITZEND_FEE",
      number: input.invoiceNumber,
      timesheetId: input.timesheetId,
      recipientTenantId: input.recipientTenantId,
      issuerTenantId: input.platformTenantId,
    },
    [
      {
        description: `Loonkosten uitzendkracht - ${input.shiftTitle} - ${input.workedOn
          .toISOString()
          .slice(0, 10)}`,
        quantityHours: Number(hours.toFixed(2)),
        unitPriceCents: input.hourlyRateCents,
      },
      {
        description: `ZekerFlex uitzendopslag (${Math.round(markupRate * 100)}% — werkgeverslasten en bemiddeling)`,
        quantityHours: 1,
        unitPriceCents: markupCents,
      },
    ],
    vat,
  );
}
