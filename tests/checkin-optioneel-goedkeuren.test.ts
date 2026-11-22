import { beforeEach, describe, expect, it, vi } from "vitest";

// Uren goedkeuren (lib/timesheets/approve.ts) bij een bedrijf dat inchecken wel of niet vraagt (lib/checkin/vereist.ts). Standaard
// blijft een ontbrekende check-in een blokkade (met "overrideGpsCheck" als uitweg). Staat inchecken uit, dan is er geen bewijs van
// aanwezigheid om te controleren: de goedkeuring van het bedrijf zelf is het bewijs. Facturen en platformkosten volgen de
// goedgekeurde uren zoals altijd (hier: de partner-tak, 8 uur x € 3,50 + 21% btw), en het auditspoor zegt dat het zonder
// inchecken ging. Een check-in die er toch is (buiten de vestiging, nep-locatie) wordt gewoon gecontroleerd.

type Tik = { type: string; mocked: boolean; withinGeofence: boolean; distanceToBranchMeters: number };
const h = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  partner: true,
  facturen: [] as { type: string; recipientTenantId: string; totalCents: number }[],
  timesheetUpdates: 0,
  audits: [] as { action: string; summary: string; metadata: Record<string, unknown> }[],
  fraudIn: [] as { incheckenVereist?: boolean }[],
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
  gpsEvents: [] as Tik[],
  dispute: null,
  branch: { id: "b1", name: "Magazijn", tenantId: "bureau1", tenant: { name: "Bureau Noord", country: "NL", vatNumber: null } },
  freelancer: { userId: "u1", country: "NL", vatValid: false, kvkValid: false, payoutIban: null, payoutIbanPendingVerification: false, stripeConnectedAccountId: null, stripePayoutsEnabled: false, user: { fullName: "Sem Visser" } },
};

vi.mock("@/lib/storage/kv", () => ({ kvGet: async (k: string) => h.kv.get(k) ?? null }));
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
    payment: { create: async () => undefined },
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
vi.mock("@/lib/audit", () => ({ recordAudit: async (a: { action: string; summary: string; metadata: Record<string, unknown> }) => void h.audits.push(a) }));
vi.mock("@/lib/metrics", () => ({ recordPayout: () => undefined, recordTimesheetApproved: () => undefined }));
vi.mock("@/lib/auth", () => ({ assertBranchAccess: () => undefined }));
vi.mock("@/lib/billing/numbering", () => ({ nextInvoiceNumber: async (_tx: unknown, soort: string) => `${soort}-1` }));
vi.mock("@/lib/billing/credits", () => ({ applyPendingTenantCredits: async () => undefined }));
vi.mock("@/lib/billing/sepa", () => ({ isValidIban: () => false, payoutEndToEndId: () => "e2e", triggerInstantPayout: async () => undefined }));
vi.mock("@/lib/compliance/dba", () => ({ evaluateDbaCompliance: async () => ({ riskLevel: "LOW", action: "none" }) }));
vi.mock("@/lib/billing/payout-gate", () => ({ evaluatePayoutGate: () => ({ released: false, reasons: ["kvk"] }) }));
vi.mock("@/lib/fiscal/store", () => ({ getFiscal: async () => ({ workerKind: "uitzendkracht" }), invoiceModeFor: () => "payroll" }));
vi.mock("@/lib/payouts/advances", () => ({ createPayrollAdvance: async () => undefined }));
vi.mock("@/lib/bank/earnings", () => ({ creditEarning: async () => undefined, getPayoutDestination: async () => "iban" }));
vi.mock("@/lib/payouts/execute", () => ({ dispatchPayout: async () => undefined }));
vi.mock("@/lib/bank/accounts", () => ({ accountForPrincipal: async () => ({ account: {} }), personalAccount: async () => ({ number: "x" }) }));
vi.mock("@/lib/rewards/referral", () => ({ rewardReferral: async () => undefined }));
vi.mock("@/lib/payouts/fastpay", () => ({ getFastPay: async () => ({ advancesForUitzend: false }) }));
vi.mock("@/lib/pricing/volume", () => ({ feePerHourFor: () => 350, monthHoursFor: async () => 0, tierFor: () => ({ tier: { name: "Basis" } }) }));
vi.mock("@/lib/billing/comp", () => ({ isCompTenant: async () => false }));
vi.mock("@/lib/introducties/vrijstelling", () => ({ introductieZonderFee: async () => false }));
vi.mock("@/lib/introducties/periode", () => ({ INTRODUCTIE_FEE_REDEN: "introductie" }));
vi.mock("@/lib/billing/partnerdeal-vrij", () => ({ PARTNERDEAL_FEE_REDEN: "partnerdeal", partnerdealZonderFee: async () => false, EERSTE_MAAND_GRATIS_VLAG: "eerste-maand-gratis", startEersteMaandGratis: async () => false }));
vi.mock("@/lib/uitzendbureau/insights", () => ({ markupFor: async () => 0.3 }));
vi.mock("@/lib/fraud/timesheet", () => ({
  evaluateTimesheetFraud: (i: { incheckenVereist?: boolean }) => {
    h.fraudIn.push(i);
    return [];
  },
}));
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
const UIT = { vereist: false, sinds: "2026-11-22T09:00:00.000Z" };
const GOED: Tik = { type: "CHECK_IN", mocked: false, withinGeofence: true, distanceToBranchMeters: 10 };
const PLATFORMKOSTEN = Math.round(2800 * 1.21); // 8 uur x € 3,50 + 21% btw

beforeEach(() => {
  h.kv.clear();
  h.partner = true;
  h.facturen = [];
  h.timesheetUpdates = 0;
  h.audits = [];
  h.fraudIn = [];
  ts.gpsEvents = [];
});

describe("uren goedkeuren zonder check-in", () => {
  it("standaard (inchecken nodig): zonder check-in geen goedkeuring, er verandert niets", async () => {
    await expect(approveTimesheet({ timesheetId: "ts1", principal })).rejects.toThrow(/No GPS check-in recorded/);
    expect(h.timesheetUpdates).toBe(0);
    expect(h.facturen).toEqual([]);
    expect(h.fraudIn).toEqual([]); // de controle liep niet eens verder dan de aanwezigheid
  });

  it("inchecken uit: de goedkeuring van het bedrijf is het bewijs, ook zonder check-in; facturen en platformkosten volgen de uren", async () => {
    h.kv.set("incheck:instelling:bureau1", UIT);
    const r = await approveTimesheet({ timesheetId: "ts1", principal });
    expect(r.status).toBe("APPROVED");
    expect(r.track).toBe("partner");
    expect(h.timesheetUpdates).toBe(1);
    expect(h.facturen).toEqual([{ type: "PLATFORM_FEE", recipientTenantId: "bureau1", totalCents: PLATFORMKOSTEN }]);
    // de fraudecontrole weet dat een ontbrekende check-in hier geen signaal is
    expect(h.fraudIn).toEqual([expect.objectContaining({ incheckenVereist: false })]);
  });

  it("het auditspoor zegt dat de uren zonder inchecken zijn ingediend en door het bedrijf zijn goedgekeurd", async () => {
    h.kv.set("incheck:instelling:bureau1", UIT);
    await approveTimesheet({ timesheetId: "ts1", principal });
    expect(h.audits).toHaveLength(1);
    expect(h.audits[0]?.action).toBe("timesheet.approved");
    expect(h.audits[0]?.summary).toContain("zonder inchecken ingediend, goedgekeurd door het bedrijf");
    expect(h.audits[0]?.metadata).toMatchObject({ zonderInchecken: true, overrodeGpsCheck: false });
  });

  it("ook het loonspoor (uitzendkracht): zonder check-in goedgekeurd, met dezelfde vermelding", async () => {
    h.partner = false;
    h.kv.set("incheck:instelling:bureau1", UIT);
    const r = await approveTimesheet({ timesheetId: "ts1", principal });
    expect(r.track).toBe("payroll");
    expect(h.facturen.map((f) => f.type)).toEqual(["UITZEND_FEE"]);
    expect(h.audits[0]?.metadata).toMatchObject({ zonderInchecken: true });
  });

  it("met inchecken (standaard) en een goede check-in: gewoon goedgekeurd, niet als 'zonder inchecken' vastgelegd", async () => {
    ts.gpsEvents = [GOED];
    const r = await approveTimesheet({ timesheetId: "ts1", principal });
    expect(r.track).toBe("partner");
    expect(h.audits[0]?.metadata).toMatchObject({ zonderInchecken: false });
    expect(h.audits[0]?.summary).not.toContain("zonder inchecken");
    expect(h.fraudIn).toEqual([expect.objectContaining({ incheckenVereist: true })]);
  });

  it("inchecken uit maar er is wel ingecheckt: die check-in wordt gecontroleerd (buiten de vestiging, nep-locatie) en is dus niet 'zonder inchecken'", async () => {
    h.kv.set("incheck:instelling:bureau1", UIT);
    ts.gpsEvents = [{ ...GOED, withinGeofence: false, distanceToBranchMeters: 900 }];
    await expect(approveTimesheet({ timesheetId: "ts1", principal })).rejects.toThrow(/outside the branch geofence/);
    ts.gpsEvents = [{ ...GOED, mocked: true }];
    await expect(approveTimesheet({ timesheetId: "ts1", principal })).rejects.toThrow(/mock-location/);
    expect(h.timesheetUpdates).toBe(0);
    expect(h.facturen).toEqual([]);
  });

  it("de keuze geldt per bedrijf: een andere organisatie met inchecken uit verandert niets voor dit bedrijf", async () => {
    h.kv.set("incheck:instelling:ander", UIT);
    await expect(approveTimesheet({ timesheetId: "ts1", principal })).rejects.toThrow(/No GPS check-in recorded/);
  });

  it("met 'overrideGpsCheck' blijft het kunnen (zoals voorheen), en dat is geen 'zonder inchecken'-keuze van het bedrijf", async () => {
    const r = await approveTimesheet({ timesheetId: "ts1", principal, overrideGpsCheck: true });
    expect(r.status).toBe("APPROVED");
    expect(h.audits[0]?.metadata).toMatchObject({ zonderInchecken: false, overrodeGpsCheck: true });
  });
});
