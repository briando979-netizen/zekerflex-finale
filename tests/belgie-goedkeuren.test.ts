import { beforeEach, describe, expect, it, vi } from "vitest";

// Uren goedkeuren bij een klus in België (lib/timesheets/approve.ts, 28 nov 2026): het bedrijf is de werkgever (student of
// flexi-job), dus ZekerFlex maakt alleen de PLATFORM_FEE-factuur. Geen uitbetaling, geen factuur op naam van de werker, geen
// loonspoor. Een Belgisch bedrijf met btw-nummer krijgt de factuur zonder btw, met de vermelding van de verlegging. Een klus in
// Nederland loopt precies zoals altijd (de laatste twee tests).

const h = vi.hoisted(() => ({
  partner: false,
  postcode: "BE-2000",
  land: "BE",
  btw: "BE0123456789" as string | null,
  modus: "payroll" as "payroll" | "invoice",
  fiscaalGelezen: 0,
  facturen: [] as { type: string; recipientTenantId: string; totalCents: number; vatCents: number; vatTreatment: string; regels: string[] }[],
  betalingen: 0,
  uitbetaald: 0,
  voorschot: 0,
  timesheetUpdates: 0,
  audit: [] as { summary: string; metadata?: { track?: string } }[],
}));

const ts = () => ({
  id: "ts1",
  branchId: "b1",
  status: "SUBMITTED",
  billableMinutes: 480,
  scheduledStart: new Date("2026-12-05T09:00:00+01:00"),
  scheduledEnd: new Date("2026-12-05T17:00:00+01:00"),
  actualStart: null,
  actualEnd: null,
  breakMinutes: 0,
  hourlyRateCents: 1450,
  extraCostsCents: null,
  extraCostsNote: null,
  freelancerId: "fp1",
  gpsEvents: [{ type: "CHECK_IN", mocked: false, withinGeofence: true, distanceToBranchMeters: 10 }],
  dispute: null,
  branch: { id: "b1", name: "Terras", postalCode: h.postcode, tenantId: "bedrijf1", tenant: { name: "Brasserie De Meir", country: h.land, vatNumber: h.btw } },
  freelancer: { userId: "u1", country: "BE", vatValid: false, kvkValid: false, payoutIban: null, payoutIbanPendingVerification: false, stripeConnectedAccountId: null, stripePayoutsEnabled: false, user: { fullName: "Lotte Peeters" } },
});

vi.mock("@/lib/prisma", () => {
  const tx = {
    timesheet: { update: async () => void h.timesheetUpdates++ },
    dispute: { update: async () => undefined },
    invoice: {
      create: async ({ data }: { data: { type: string; recipientTenantId: string; totalCents: number; vatCents: number; vatTreatment: string; lines: { create: { description: string }[] } } }) => {
        h.facturen.push({
          type: data.type,
          recipientTenantId: data.recipientTenantId,
          totalCents: data.totalCents,
          vatCents: data.vatCents,
          vatTreatment: data.vatTreatment,
          regels: data.lines.create.map((l) => l.description),
        });
        return { id: `inv-${h.facturen.length}`, ...data };
      },
    },
    payment: { create: async () => void h.betalingen++ },
  };
  return {
    prisma: {
      timesheet: { findUnique: async () => ts(), count: async () => 0 },
      tenant: { findFirst: async () => ({ id: "zf" }) },
      $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
    },
  };
});
vi.mock("@/lib/redis", () => ({ acquireLock: async () => async () => undefined }));
vi.mock("@/lib/audit", () => ({ recordAudit: async (a: { summary: string; metadata?: { track?: string } }) => void h.audit.push(a) }));
vi.mock("@/lib/metrics", () => ({ recordPayout: () => undefined, recordTimesheetApproved: () => undefined }));
vi.mock("@/lib/auth", () => ({ assertBranchAccess: () => undefined }));
vi.mock("@/lib/billing/numbering", () => ({ nextInvoiceNumber: async (_tx: unknown, soort: string) => `${soort}-1` }));
vi.mock("@/lib/billing/credits", () => ({ applyPendingTenantCredits: async () => undefined }));
vi.mock("@/lib/billing/sepa", () => ({ isValidIban: () => false, payoutEndToEndId: () => "e2e", triggerInstantPayout: async () => undefined }));
vi.mock("@/lib/compliance/dba", () => ({ evaluateDbaCompliance: async () => ({ riskLevel: "LOW", action: "none" }) }));
vi.mock("@/lib/billing/payout-gate", () => ({ evaluatePayoutGate: () => ({ released: false, reasons: ["kvk"] }) }));
vi.mock("@/lib/fiscal/store", () => ({
  getFiscal: async () => {
    h.fiscaalGelezen++;
    return { workerKind: h.modus === "payroll" ? "uitzendkracht" : "zzp" };
  },
  invoiceModeFor: () => h.modus,
}));
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
vi.mock("@/lib/billing/partnerdeal-vrij", () => ({ PARTNERDEAL_FEE_REDEN: "partnerdeal", partnerdealZonderFee: async () => false, EERSTE_MAAND_GRATIS_VLAG: "eerste-maand-gratis", startEersteMaandGratis: async () => false }));
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
import { BE_VERLEGD_VERMELDING } from "@/lib/billing/self-billing";

const principal = { userId: "manager1" } as never;

beforeEach(() => {
  h.partner = false;
  h.postcode = "BE-2000";
  h.land = "BE";
  h.btw = "BE0123456789";
  h.modus = "payroll";
  h.fiscaalGelezen = 0;
  h.facturen = [];
  h.betalingen = 0;
  h.uitbetaald = 0;
  h.voorschot = 0;
  h.timesheetUpdates = 0;
  h.audit = [];
});

describe("uren goedkeuren bij een klus in België", () => {
  it("Belgisch bedrijf: alleen de platformkosten, zonder btw en met de vermelding van de verlegging", async () => {
    const r = await approveTimesheet({ timesheetId: "ts1", principal });
    expect(r.track).toBe("werkgever");
    expect(r.payout).toBeNull();
    expect(r.advance).toBeNull();
    expect(r.payroll).toBeNull();
    expect(h.timesheetUpdates).toBe(1);
    expect(h.facturen).toHaveLength(1);
    const f = h.facturen[0]!;
    expect(f).toMatchObject({ type: "PLATFORM_FEE", recipientTenantId: "bedrijf1", vatTreatment: "REVERSE_CHARGE", vatCents: 0 });
    // 8 uur x € 3,50, geen btw
    expect(f.totalCents).toBe(2800);
    expect(f.regels[0]).toContain("€ 3,50 per gewerkt uur");
    expect(f.regels[0]).toContain(BE_VERLEGD_VERMELDING);
    expect(BE_VERLEGD_VERMELDING).toBe("Btw verlegd (verlegging van heffing). Art. 196 richtlijn 2006/112/EG; art. 51, §2 Btw-wetboek.");
    expect(h.betalingen).toBe(0);
    expect(h.uitbetaald).toBe(0);
    expect(h.voorschot).toBe(0);
    // het spoor van de werker (zzp, uitzendkracht) doet er niet toe: het bedrijf is de werkgever
    expect(h.fiscaalGelezen).toBe(0);
    expect(h.audit.find((a) => a.metadata?.track === "werkgever")?.summary).toContain("klus in België");
  });

  it("ook als de werker zzp'er is: geen factuur op zijn naam en geen uitbetaling", async () => {
    h.modus = "invoice";
    const r = await approveTimesheet({ timesheetId: "ts1", principal });
    expect(r.track).toBe("werkgever");
    expect(h.facturen.map((f) => f.type)).toEqual(["PLATFORM_FEE"]);
    expect(h.uitbetaald).toBe(0);
  });

  it("een Nederlands bedrijf met een werklocatie in België: hetzelfde spoor, maar gewoon 21% btw en geen Belgische vermelding", async () => {
    h.land = "NL";
    h.btw = null;
    const r = await approveTimesheet({ timesheetId: "ts1", principal });
    expect(r.track).toBe("werkgever");
    const f = h.facturen[0]!;
    expect(f.vatTreatment).toBe("STANDARD_RATE");
    expect(f.totalCents).toBe(Math.round(2800 * 1.21));
    expect(f.regels[0]).not.toContain("verlegging");
  });

  it("ook bij een uitzendpartner wint België: het bedrijf is daar zelf de werkgever", async () => {
    h.partner = true;
    expect((await approveTimesheet({ timesheetId: "ts1", principal })).track).toBe("werkgever");
  });
});

describe("een klus in Nederland verandert niet", () => {
  it("een uitzendkracht zonder partner gaat via het loonspoor, zoals altijd", async () => {
    h.postcode = "1012 AB";
    h.land = "NL";
    h.btw = null;
    const r = await approveTimesheet({ timesheetId: "ts1", principal });
    expect(r.track).toBe("payroll");
    expect(h.facturen.map((f) => f.type)).toEqual(["UITZEND_FEE"]);
    expect(h.fiscaalGelezen).toBe(1);
  });

  it("een uitzendpartner in Nederland blijft het partnerspoor, met 21% btw", async () => {
    h.postcode = "1012 AB";
    h.land = "NL";
    h.btw = null;
    h.partner = true;
    const r = await approveTimesheet({ timesheetId: "ts1", principal });
    expect(r.track).toBe("partner");
    expect(h.facturen).toEqual([expect.objectContaining({ type: "PLATFORM_FEE", vatTreatment: "STANDARD_RATE", totalCents: Math.round(2800 * 1.21) })]);
    expect(h.facturen[0]?.regels[0]).not.toContain("verlegging");
  });
});

describe("de vermelding alleen voor België", () => {
  it("een Duits bedrijf met btw-nummer: verlegd, maar zonder de Belgische tekst", async () => {
    const { buildPlatformFeeInvoice } = await import("@/lib/billing/self-billing");
    const de = buildPlatformFeeInvoice({
      timesheetId: "t",
      billableMinutes: 60,
      recipientTenantId: "r",
      recipientCountry: "DE",
      recipientVatValidForReverseCharge: true,
      platformTenantId: "p",
      shiftTitle: "Shift",
      invoiceNumber: "PF-1",
    });
    expect(de.vatTreatment).toBe("REVERSE_CHARGE");
    expect(de.lines[0]?.description).not.toContain(BE_VERLEGD_VERMELDING);
    // België zonder geldig btw-nummer: niet verlegd, dus ook geen vermelding (zoals altijd: buiten de reikwijdte)
    const beZonder = buildPlatformFeeInvoice({ ...{ timesheetId: "t", billableMinutes: 60, recipientTenantId: "r", platformTenantId: "p", shiftTitle: "Shift", invoiceNumber: "PF-1" }, recipientCountry: "BE", recipientVatValidForReverseCharge: false });
    expect(beZonder.vatTreatment).toBe("OUT_OF_SCOPE");
    expect(beZonder.lines[0]?.description).not.toContain(BE_VERLEGD_VERMELDING);
  });
});
