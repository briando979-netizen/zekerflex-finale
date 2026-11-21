import { beforeEach, describe, expect, it, vi } from "vitest";

// Goedkeuren bij een uitzendpartner (lib/timesheets/approve.ts, approveViaPartner), echt doorlopen: het bureau is de werkgever,
// dus ZekerFlex maakt alleen de PLATFORM_FEE-factuur aan het bureau. Geen factuur op naam van de werker, geen betaling, geen
// uitbetaling, geen voorschot, ook niet als de werker zelf een uitzendkracht (loonspoor) is.

const h = vi.hoisted(() => ({
  partner: true,
  facturen: [] as { type: string; recipientTenantId: string; totalCents: number }[],
  betalingen: 0,
  uitbetaald: 0,
  voorschot: 0,
  timesheetUpdates: 0,
}));

const ts = {
  id: "ts1",
  branchId: "b1",
  status: "SUBMITTED",
  billableMinutes: 480,
  scheduledStart: new Date("2026-11-24T09:00:00+01:00"),
  scheduledEnd: new Date("2026-11-24T17:00:00+01:00"),
  actualStart: null,
  actualEnd: null,
  breakMinutes: 0,
  hourlyRateCents: 1620,
  extraCostsCents: null,
  extraCostsNote: null,
  freelancerId: "fp1",
  gpsEvents: [{ type: "CHECK_IN", mocked: false, withinGeofence: true, distanceToBranchMeters: 10 }],
  dispute: null,
  branch: { id: "b1", name: "Magazijn", tenantId: "bureau1", tenant: { name: "Bureau Noord", country: "NL", vatNumber: null } },
  freelancer: { userId: "u1", country: "NL", vatValid: false, kvkValid: false, payoutIban: null, payoutIbanPendingVerification: false, stripeConnectedAccountId: null, stripePayoutsEnabled: false, user: { fullName: "Sem Visser" } },
};

vi.mock("@/lib/prisma", () => {
  const tx = {
    timesheet: { update: async () => void h.timesheetUpdates++ },
    dispute: { update: async () => undefined },
    invoice: {
      create: async ({ data }: { data: { number: string; type: string; recipientTenantId: string; totalCents: number } }) => {
        h.facturen.push({ type: data.type, recipientTenantId: data.recipientTenantId, totalCents: data.totalCents });
        return { id: `inv-${h.facturen.length}`, ...data };
      },
    },
    payment: { create: async () => void h.betalingen++ },
  };
  return {
    prisma: {
      timesheet: { findUnique: async () => ts, count: async () => 0 },
      tenant: { findFirst: async () => ({ id: "zf" }) },
      $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
    },
  };
});
vi.mock("@/lib/redis", () => ({ acquireLock: async () => async () => undefined }));
vi.mock("@/lib/audit", () => ({ recordAudit: async () => undefined }));
vi.mock("@/lib/metrics", () => ({ recordPayout: () => undefined, recordTimesheetApproved: () => undefined }));
vi.mock("@/lib/auth", () => ({ assertBranchAccess: () => undefined }));
vi.mock("@/lib/billing/numbering", () => ({ nextInvoiceNumber: async (_tx: unknown, soort: string) => `${soort}-1` }));
vi.mock("@/lib/billing/credits", () => ({ applyPendingTenantCredits: async () => undefined }));
vi.mock("@/lib/billing/sepa", () => ({ isValidIban: () => false, payoutEndToEndId: () => "e2e", triggerInstantPayout: async () => undefined }));
vi.mock("@/lib/compliance/dba", () => ({ evaluateDbaCompliance: async () => ({ riskLevel: "LOW", action: "none" }) }));
vi.mock("@/lib/billing/payout-gate", () => ({ evaluatePayoutGate: () => ({ released: false, reasons: ["kvk"] }) }));
vi.mock("@/lib/fiscal/store", () => ({ getFiscal: async () => ({ workerKind: "uitzendkracht" }), invoiceModeFor: () => "payroll" }));
vi.mock("@/lib/payouts/advances", () => ({ createPayrollAdvance: async () => void h.voorschot++ }));
vi.mock("@/lib/bank/earnings", () => ({ creditEarning: async () => undefined, getPayoutDestination: async () => "iban" }));
vi.mock("@/lib/payouts/execute", () => ({ dispatchPayout: async () => void h.uitbetaald++ }));
vi.mock("@/lib/bank/accounts", () => ({ accountForPrincipal: async () => ({ account: {} }), personalAccount: async () => ({ number: "x" }) }));
vi.mock("@/lib/rewards/referral", () => ({ rewardReferral: async () => undefined }));
vi.mock("@/lib/payouts/fastpay", () => ({ getFastPay: async () => ({ advancesForUitzend: true }) }));
vi.mock("@/lib/pricing/volume", () => ({ feePerHourFor: () => 350, monthHoursFor: async () => 0, tierFor: () => ({ tier: { name: "Basis" } }) }));
vi.mock("@/lib/billing/comp", () => ({ isCompTenant: async () => false }));
vi.mock("@/lib/introducties/vrijstelling", () => ({ introductieZonderFee: async () => false }));
vi.mock("@/lib/introducties/periode", () => ({ INTRODUCTIE_FEE_REDEN: "introductie" }));
vi.mock("@/lib/billing/partnerdeal-vrij", () => ({ PARTNERDEAL_FEE_REDEN: "partnerdeal", partnerdealZonderFee: async () => false }));
vi.mock("@/lib/uitzendbureau/insights", () => ({ markupFor: async () => 0.3 }));
vi.mock("@/lib/fraud/timesheet", () => ({ evaluateTimesheetFraud: () => [] }));
vi.mock("@/lib/webhooks/dispatcher", () => ({ dispatchWebhook: async () => undefined }));
vi.mock("@/lib/profile/store", () => ({ getOrgProfileExtra: async () => ({}) }));
vi.mock("@/lib/notifications/localized-push", () => ({ sendLocalizedPush: async () => undefined }));
vi.mock("@/lib/notifications/push-eenmalig", () => ({ eenmaligPush: async () => false }));
vi.mock("@/lib/timesheets/bulk-goedkeuren", () => ({ WERKER_BEDRIJF_MIST: "bedrijf mist" }));
vi.mock("@/lib/efactuur/bezorging", () => ({ efactuurNaUitgifte: async () => undefined }));
vi.mock("@/lib/notifications/approved-push", () => ({ pushHoursApproved: async () => undefined }));
vi.mock("@/lib/run-after", () => ({ runAfter: () => undefined }));
vi.mock("@/lib/mail", () => ({ sendMail: async () => undefined, invoiceIssuedEmail: () => ({ subject: "", text: "" }) }));
vi.mock("@/lib/billing/reminders", () => ({ recipientsFor: async () => [] }));
vi.mock("@/lib/uitzend/partners", () => ({ isUitzendPartnerTenant: async () => h.partner }));

import { approveTimesheet } from "@/lib/timesheets/approve";

const principal = { userId: "manager1" } as never;

beforeEach(() => {
  h.partner = true;
  h.facturen = [];
  h.betalingen = 0;
  h.uitbetaald = 0;
  h.voorschot = 0;
  h.timesheetUpdates = 0;
});

describe("uren goedkeuren bij een uitzendpartner", () => {
  it("alleen de platformkosten aan het bureau; geen uitbetaling, geen voorschot, geen factuur op naam van de werker", async () => {
    const r = await approveTimesheet({ timesheetId: "ts1", principal });
    expect(r.track).toBe("partner");
    expect(r.payout).toBeNull();
    expect(r.advance).toBeNull();
    expect(r.payroll).toBeNull();
    expect(h.timesheetUpdates).toBe(1);
    expect(h.facturen).toEqual([{ type: "PLATFORM_FEE", recipientTenantId: "bureau1", totalCents: expect.any(Number) }]);
    // 8 uur x € 3,50 + 21% btw
    expect(h.facturen[0]?.totalCents).toBe(Math.round(2800 * 1.21));
    expect(h.betalingen).toBe(0);
    expect(h.uitbetaald).toBe(0);
    expect(h.voorschot).toBe(0);
  });

  it("zonder partner gaat een uitzendkracht nog via het loonspoor (de partner-tak is echt de enige uitzondering)", async () => {
    h.partner = false;
    const r = await approveTimesheet({ timesheetId: "ts1", principal });
    expect(r.track).toBe("payroll");
    expect(h.facturen.map((f) => f.type)).toEqual(["UITZEND_FEE"]);
  });
});
