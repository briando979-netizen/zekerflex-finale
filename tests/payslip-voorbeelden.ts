import type { PayslipRecord } from "@/lib/payroll/store";

// Voorbeeld-loonstroken voor de tests van de loonstrookuitleg (explainPayslip) en de weergave in vijf talen.

const basis = {
  userId: "u1",
  freelancerId: "f1",
  workerName: "Test Werker",
  workerEmail: null,
  isoWeek: "2026-W45",
  weekLabel: "week 45 · 02-11 t/m 08-11 2026",
  fiscalComplete: true,
  generatedAt: "2026-11-10T00:00:00.000Z",
};

const regel = (clientName: string) => ({ shiftId: `s-${clientName}`, shiftTitle: "Bediening", clientName, workedOn: "2026-11-03", hours: 38.5, hourlyRateCents: 1800, grossCents: 69300 });

/** uitzendkracht met alle toeslagen, plusregeling, twee opdrachtgevers en een voorschot */
export const PAYROLL_VOL: PayslipRecord = {
  ...basis,
  workerKind: "uitzendkracht",
  weeksWorked: 12,
  computed: {
    totalHours: 38.5,
    lines: [regel("Acme"), regel("Beta")],
    headlineCents: 53034,
    headlineLabel: "netto (indicatief)",
    breakdown: {
      kind: "payroll",
      grossCents: 75000,
      cao: { caoKey: "abu", caoLabel: "ABU-cao", baseCents: 69300, nachtCents: 2000, weekendCents: 3000, feestdagCents: 500, overwerkCents: 200, toeslagCents: 5700, wmlFloorApplied: false, nachtHours: 4.5, weekendHours: 8, feestdagHours: 2, overwerkHours: 1 },
      holidayAllowanceCents: 6248,
      holidayHoursReserveCents: 8123,
      shortLeaveReserveCents: 450,
      pensionEmployeeCents: 2000,
      pensionEmployerCents: 4000,
      pensionRegeling: "plus",
      taxableCents: 73000,
      wageTaxIndicativeCents: 19966,
      netIndicativeCents: 53034,
      phase: "B",
    },
  },
  advance: { grossCents: 20000, netPaidCents: 15000, feeCents: 300, count: 2 },
  toPayCents: 33034,
};

/** uitzendkracht onder het minimumloon, geen pensioen, één opdrachtgever, geen voorschot */
export const PAYROLL_WML: PayslipRecord = {
  ...basis,
  workerKind: "uitzendkracht",
  weeksWorked: 3,
  computed: {
    totalHours: 20,
    lines: [regel("Acme")],
    headlineCents: 24000,
    headlineLabel: "netto (indicatief)",
    breakdown: {
      kind: "payroll",
      grossCents: 31000,
      cao: { caoKey: "abu", caoLabel: "ABU-cao", baseCents: 31000, nachtCents: 0, weekendCents: 0, feestdagCents: 0, overwerkCents: 0, toeslagCents: 0, wmlFloorApplied: true, nachtHours: 0, weekendHours: 0, feestdagHours: 0, overwerkHours: 0 },
      holidayAllowanceCents: 2583,
      holidayHoursReserveCents: 3357,
      shortLeaveReserveCents: 186,
      pensionEmployeeCents: 0,
      pensionEmployerCents: 0,
      pensionRegeling: "geen",
      taxableCents: 31000,
      wageTaxIndicativeCents: 7000,
      netIndicativeCents: 24000,
      phase: "A",
    },
  },
  advance: null,
  toPayCents: 24000,
};

/** zzp met btw, en zonder btw (verlegd) */
export const FACTUUR_BTW: PayslipRecord = {
  ...basis,
  workerKind: "zzp",
  weeksWorked: 5,
  computed: {
    totalHours: 10,
    lines: [regel("Acme")],
    headlineCents: 24200,
    headlineLabel: "uit te betalen (incl. btw)",
    breakdown: { kind: "invoice", mode: "reverse-billing", servicesCents: 20000, vatRate: 0.21, vatCents: 4200, invoiceTotalCents: 24200, platformFeeCents: 3500, platformFeeVatCents: 735, payoutToWorkerCents: 24200 },
  },
  advance: null,
  toPayCents: 24200,
};

export const FACTUUR_ZONDER_BTW: PayslipRecord = {
  ...FACTUUR_BTW,
  computed: {
    ...FACTUUR_BTW.computed,
    headlineCents: 20000,
    headlineLabel: "uit te betalen",
    breakdown: { kind: "invoice", mode: "self-invoice", servicesCents: 20000, vatRate: 0, vatCents: 0, invoiceTotalCents: 20000, platformFeeCents: 3500, platformFeeVatCents: 735, payoutToWorkerCents: 20000 },
  },
  toPayCents: 20000,
};

export const VOORBEELDEN = { PAYROLL_VOL, PAYROLL_WML, FACTUUR_BTW, FACTUUR_ZONDER_BTW };
