import type { InvoiceMode, WorkerKind } from "@/lib/fiscal/store";
import { env } from "@/lib/env";

export { euro } from "@/lib/payroll/format";

// ---------------------------------------------------------------------------
// Pure weekly-payroll / weekly-invoice computation. Integer cents throughout.
// Nothing here reads a database or the filesystem.
//
//   uitzendkracht  → payroll: bruto, vakantiegeld- en vakantie-urenreservering,
//                    StiPP-pensioen, indicatieve loonheffing, netto
//   zzp            → reverse billing: dienstbedrag + 21% btw (NL), platformfee
//   flexwerker     → self-invoice of reverse billing, btw of KOR (0%)
// ---------------------------------------------------------------------------

/** ABU-cao style reserveringen (indicatief, jaarlijks bijstelbaar). */
export const HOLIDAY_ALLOWANCE_PCT = 0.0833; // vakantiegeld 8,33%
export const HOLIDAY_HOURS_PCT = 0.1083; // vakantie-uren ~25 dagen
export const SHORT_LEAVE_PCT = 0.006; // kort verzuim / bijzonder verlof
export const STIPP_BASIS_START_WEEK = 9; // pensioenopbouw vanaf week 9
export const STIPP_PLUS_START_WEEK = 79; // plusregeling na 78 gewerkte weken
export const STIPP_BASIS_EMPLOYER_PCT = 0.026; // werkgeversdeel basisregeling
export const STIPP_PLUS_EMPLOYER_PCT = 0.08; // indicatief werkgeversdeel plus

// Platform fee billed to the client: flat EUR per gewerkt uur (not a %).
const PLATFORM_FEE_PER_HOUR_CENTS = env.PLATFORM_FEE_PER_HOUR_CENTS;

export type PayslipKind = "payroll" | "invoice";

export interface PayLineInput {
  shiftId: string;
  shiftTitle: string;
  clientName: string;
  workedOn: string; // ISO date
  hours: number; // billable hours, 2 decimals
  hourlyRateCents: number;
}

export interface PayslipComputeInput {
  workerKind: WorkerKind;
  invoiceMode: InvoiceMode;
  vatValid: boolean;
  korApplies: boolean;
  loonheffingskorting: boolean;
  /** cumulative distinct worked weeks up to and including this one */
  weeksWorked: number;
  lines: PayLineInput[];
}

export interface PayslipLine extends PayLineInput {
  grossCents: number;
}

export interface PayrollBreakdown {
  kind: "payroll";
  grossCents: number;
  holidayAllowanceCents: number;
  holidayHoursReserveCents: number;
  shortLeaveReserveCents: number;
  pensionEmployeeCents: number;
  pensionEmployerCents: number;
  pensionRegeling: "geen" | "basis" | "plus";
  taxableCents: number;
  wageTaxIndicativeCents: number;
  netIndicativeCents: number;
  phase: "A" | "B" | "C";
}

export interface InvoiceBreakdown {
  kind: "invoice";
  mode: InvoiceMode;
  servicesCents: number;
  vatRate: number;
  vatCents: number;
  invoiceTotalCents: number;
  platformFeeCents: number;
  platformFeeVatCents: number;
  payoutToWorkerCents: number;
}

export interface ComputedPayslip {
  totalHours: number;
  lines: PayslipLine[];
  breakdown: PayrollBreakdown | InvoiceBreakdown;
  /** headline number the worker cares about */
  headlineCents: number;
  headlineLabel: string;
}

const r = (n: number) => Math.round(n);

export function abuPhase(weeksWorked: number): "A" | "B" | "C" {
  if (weeksWorked <= 52) return "A";
  if (weeksWorked <= 52 + 156) return "B";
  return "C";
}

export function stippRegeling(weeksWorked: number): "geen" | "basis" | "plus" {
  if (weeksWorked >= STIPP_PLUS_START_WEEK) return "plus";
  if (weeksWorked >= STIPP_BASIS_START_WEEK) return "basis";
  return "geen";
}

export function computePayslip(input: PayslipComputeInput): ComputedPayslip {
  const lines: PayslipLine[] = input.lines.map((l) => ({
    ...l,
    grossCents: r(l.hours * l.hourlyRateCents),
  }));
  const totalHours = r(input.lines.reduce((s, l) => s + l.hours, 0) * 100) / 100;
  const grossCents = lines.reduce((s, l) => s + l.grossCents, 0);

  if (input.workerKind === "uitzendkracht" || input.invoiceMode === "payroll") {
    const holidayAllowanceCents = r(grossCents * HOLIDAY_ALLOWANCE_PCT);
    const holidayHoursReserveCents = r(grossCents * HOLIDAY_HOURS_PCT);
    const shortLeaveReserveCents = r(grossCents * SHORT_LEAVE_PCT);

    const regeling = stippRegeling(input.weeksWorked);
    const pensionBase = grossCents + holidayAllowanceCents;
    const pensionEmployerCents =
      regeling === "plus"
        ? r(pensionBase * STIPP_PLUS_EMPLOYER_PCT)
        : regeling === "basis"
          ? r(pensionBase * STIPP_BASIS_EMPLOYER_PCT)
          : 0;
    // Basisregeling: fully employer-paid. Plusregeling: ~1/3 employee.
    const pensionEmployeeCents = regeling === "plus" ? r(pensionEmployerCents / 2) : 0;

    const taxableCents = grossCents - pensionEmployeeCents;
    // Indicative wage tax — NOT a payroll-accurate figure, clearly labelled in UI.
    const rate = input.loonheffingskorting ? 0.2735 : 0.3697;
    const wageTaxIndicativeCents = Math.max(0, r(taxableCents * rate));
    const netIndicativeCents = taxableCents - wageTaxIndicativeCents;

    return {
      totalHours,
      lines,
      headlineCents: netIndicativeCents,
      headlineLabel: "netto (indicatief)",
      breakdown: {
        kind: "payroll",
        grossCents,
        holidayAllowanceCents,
        holidayHoursReserveCents,
        shortLeaveReserveCents,
        pensionEmployeeCents,
        pensionEmployerCents,
        pensionRegeling: regeling,
        taxableCents,
        wageTaxIndicativeCents,
        netIndicativeCents,
        phase: abuPhase(input.weeksWorked),
      },
    };
  }

  // zzp / flexwerker → weekly invoice
  const chargesVat = input.workerKind === "zzp" ? input.vatValid : input.vatValid && !input.korApplies;
  const vatRate = chargesVat ? env.VAT_RATE_STANDARD : 0;
  const servicesCents = grossCents;
  const vatCents = r(servicesCents * vatRate);
  const invoiceTotalCents = servicesCents + vatCents;
  const platformFeeCents = r(totalHours * PLATFORM_FEE_PER_HOUR_CENTS);
  const platformFeeVatCents = r(platformFeeCents * env.VAT_RATE_STANDARD);
  // The worker is paid the full services amount (+ VAT they must remit); the
  // platform fee is invoiced to the client, not deducted here.
  const payoutToWorkerCents = invoiceTotalCents;

  return {
    totalHours,
    lines,
    headlineCents: payoutToWorkerCents,
    headlineLabel: chargesVat ? "uit te betalen (incl. btw)" : "uit te betalen",
    breakdown: {
      kind: "invoice",
      mode: input.invoiceMode,
      servicesCents,
      vatRate,
      vatCents,
      invoiceTotalCents,
      platformFeeCents,
      platformFeeVatCents,
      payoutToWorkerCents,
    },
  };
}

