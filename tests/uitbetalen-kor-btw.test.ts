import { beforeEach, describe, expect, it, vi } from "vitest";

// Punt 1 en 5 van de review van de proefklussen (21 nov 2026).
// 1. Reageren liet een werker toe met KVK óf btw óf de KOR, maar uitbetalen eiste KVK én btw: een werker met de KOR of met
//    alleen een EU-btw-nummer kon nooit uitbetaald worden. Nu één regel (lib/fiscal/bedrijf-ok.ts), en de factuur op naam van
//    de werker rekent bij de KOR geen btw, met de vermelding.
// 5. "We hebben hem een bericht gestuurd" (WERKER_BEDRIJF_MIST) klopte alleen met push aan: nu ook altijd een mail, in zijn taal.
// approveTimesheet echt doorlopen op het factuurspoor, met de echte poort (lib/billing/payout-gate.ts) en de echte facturen
// (lib/billing/self-billing.ts).

type Factuur = { type: string; vatTreatment: string; vatCents: number; subtotalCents: number; totalCents: number; lines: { create: { description: string }[] } };

const h = vi.hoisted(() => ({
  fiscal: {} as Record<string, unknown>,
  freelancer: {} as Record<string, unknown>,
  facturen: [] as Factuur[],
  betalingen: [] as { amountCents: number }[],
  pushes: [] as { ids: string[]; title: string; body: string }[],
  pushFout: false,
  mails: [] as { to: string; subject: string; kind: string; text: string }[],
  eenmalig: true,
  taal: "nl" as string,
}));

const basisTs = () => ({
  id: "ts1",
  branchId: "b1",
  status: "SUBMITTED",
  billableMinutes: 480,
  scheduledStart: new Date("2026-11-24T09:00:00+01:00"),
  scheduledEnd: new Date("2026-11-24T17:00:00+01:00"),
  actualStart: null,
  actualEnd: null,
  breakMinutes: 0,
  hourlyRateCents: 2000,
  extraCostsCents: null,
  extraCostsNote: null,
  freelancerId: "fp1",
  gpsEvents: [{ type: "CHECK_IN", mocked: false, withinGeofence: true, distanceToBranchMeters: 10 }],
  dispute: null,
  branch: { id: "b1", name: "Magazijn", tenantId: "t1", tenant: { name: "Bakkerij Jansen", country: "NL", vatNumber: null } },
  freelancer: h.freelancer,
});

vi.mock("@/lib/prisma", () => {
  const tx = {
    timesheet: { update: async () => ({ id: "ts1" }) },
    dispute: { update: async () => undefined },
    invoice: {
      create: async ({ data }: { data: Factuur & { number: string } }) => {
        h.facturen.push(data);
        return { id: `inv-${h.facturen.length}`, ...data };
      },
    },
    payment: {
      create: async ({ data }: { data: { amountCents: number; endToEndId: string } }) => {
        h.betalingen.push(data);
        return { id: "pay1", ...data };
      },
    },
  };
  return {
    prisma: {
      timesheet: { findUnique: async () => basisTs(), count: async () => 0 },
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
vi.mock("@/lib/billing/sepa", () => ({ isValidIban: () => true, payoutEndToEndId: () => "e2e", triggerInstantPayout: async () => undefined }));
vi.mock("@/lib/compliance/dba", () => ({ evaluateDbaCompliance: async () => ({ riskLevel: "LOW", action: "none" }) }));
vi.mock("@/lib/fiscal/store", () => ({
  getFiscal: async () => h.fiscal,
  invoiceModeFor: (f: Record<string, unknown>) => (f.workerKind === "uitzendkracht" ? "payroll" : "reverse-billing"),
}));
vi.mock("@/lib/payouts/advances", () => ({ createPayrollAdvance: async () => undefined }));
vi.mock("@/lib/bank/earnings", () => ({ creditEarning: async () => undefined, getPayoutDestination: async () => "iban" }));
vi.mock("@/lib/payouts/execute", () => ({ dispatchPayout: async () => ({ status: "PENDING", providerRef: null }) }));
vi.mock("@/lib/bank/accounts", () => ({ accountForPrincipal: async () => ({ account: {} }), personalAccount: async () => ({ number: "x" }) }));
vi.mock("@/lib/rewards/referral", () => ({ rewardReferral: async () => undefined }));
vi.mock("@/lib/payouts/fastpay", () => ({ getFastPay: async () => ({ advancesForUitzend: false }) }));
vi.mock("@/lib/pricing/volume", () => ({ feePerHourFor: () => 350, monthHoursFor: async () => 0, tierFor: () => ({ tier: { name: "Basis" } }) }));
vi.mock("@/lib/billing/comp", () => ({ isCompTenant: async () => false }));
vi.mock("@/lib/introducties/vrijstelling", () => ({ introductieZonderFee: async () => false }));
vi.mock("@/lib/introducties/periode", () => ({ INTRODUCTIE_FEE_REDEN: "introductie" }));
// de eerste maand gratis doet hier niets: deze test gaat over de poort en de factuur op naam van de werker
vi.mock("@/lib/billing/partnerdeal-vrij", () => ({ PARTNERDEAL_FEE_REDEN: "partnerdeal", partnerdealZonderFee: async () => false, EERSTE_MAAND_GRATIS_VLAG: "eerste-maand-gratis", startEersteMaandGratis: async () => false }));
vi.mock("@/lib/flags", () => ({ featureEnabled: async () => false }));
vi.mock("@/lib/uitzendbureau/insights", () => ({ markupFor: async () => 0.3 }));
vi.mock("@/lib/fraud/timesheet", () => ({ evaluateTimesheetFraud: () => [] }));
vi.mock("@/lib/webhooks/dispatcher", () => ({ dispatchWebhook: async () => undefined }));
vi.mock("@/lib/profile/store", () => ({ getOrgProfileExtra: async () => ({}) }));
vi.mock("@/lib/notifications/localized-push", async () => {
  const { WORKER_PUSH } = await import("@/lib/i18n/worker-push");
  return {
    sendLocalizedPush: async (ids: string[], build: (t: (typeof WORKER_PUSH)["nl"]) => { title: string; body: string }) => {
      if (h.pushFout) throw new Error("push weg");
      const p = build(WORKER_PUSH.nl);
      h.pushes.push({ ids, title: p.title, body: p.body });
      return 0; // geen apparaat met meldingen aan: de push bereikt niemand
    },
  };
});
vi.mock("@/lib/notifications/push-eenmalig", () => ({ eenmaligPush: async () => h.eenmalig }));
vi.mock("@/lib/efactuur/bezorging", () => ({ efactuurNaUitgifte: async () => undefined }));
vi.mock("@/lib/notifications/approved-push", () => ({ pushHoursApproved: async () => undefined }));
vi.mock("@/lib/run-after", () => ({ runAfter: () => undefined }));
vi.mock("@/lib/mail", () => ({
  sendMail: async (m: { to: string; subject: string; kind: string; text: string }) => void h.mails.push(m),
  invoiceIssuedEmail: () => ({ subject: "", text: "" }),
}));
vi.mock("@/lib/mail/taal", () => ({ mailTaalVoorWerker: async () => h.taal }));
vi.mock("@/lib/billing/reminders", () => ({ recipientsFor: async () => [] }));
vi.mock("@/lib/uitzend/partners", () => ({ isUitzendPartnerTenant: async () => false }));

import { approveTimesheet } from "@/lib/timesheets/approve";
import { WERKER_BEDRIJF_MIST } from "@/lib/timesheets/bulk-goedkeuren";
import { KOR_VERMELDING, buildReverseBillingInvoices } from "@/lib/billing/self-billing";
import { bedrijfOk, korZonderBtw } from "@/lib/fiscal/bedrijf-ok";
import { AppError } from "@/lib/errors";

const principal = { userId: "manager1" } as never;

const werker = (patch: Record<string, unknown> = {}) => ({
  userId: "u1",
  country: "NL",
  kvkValid: false,
  vatValid: false,
  payoutIban: "NL00TEST0000000000",
  payoutIbanPendingVerification: false,
  stripeConnectedAccountId: null,
  stripePayoutsEnabled: false,
  user: { fullName: "Sem Visser", email: "sem@zekerflex.test" },
  ...patch,
});

const werkerFactuur = () => h.facturen.find((f) => f.type === "SELF_BILL_FREELANCER");

beforeEach(() => {
  h.fiscal = { workerKind: "flexwerker", vatValid: false, korApplies: false };
  h.freelancer = werker();
  h.facturen = [];
  h.betalingen = [];
  h.pushes = [];
  h.pushFout = false;
  h.mails = [];
  h.eenmalig = true;
  h.taal = "nl";
});

describe("punt 1: uitbetalen met dezelfde regel als reageren (KVK, btw of KOR)", () => {
  it("de KOR zonder KVK- of btw-nummer: goedgekeurd, factuur zonder btw en met de KOR-vermelding", async () => {
    h.fiscal = { workerKind: "flexwerker", vatValid: false, korApplies: true };
    const r = await approveTimesheet({ timesheetId: "ts1", principal });
    expect(r.track).toBe("invoice");
    const f = werkerFactuur();
    expect(f?.vatTreatment).toBe("OUT_OF_SCOPE");
    expect(f?.vatCents).toBe(0);
    // 8 uur x € 20 = € 160, zonder btw; dat bedrag gaat naar de werker
    expect(f?.totalCents).toBe(16_000);
    expect(f?.lines.create[0]?.description).toContain(KOR_VERMELDING);
    expect(h.betalingen[0]?.amountCents).toBe(16_000);
    expect(h.mails).toHaveLength(0);
  });

  it("alleen een geldig EU-btw-nummer (in de fiscale gegevens, zonder KVK): goedgekeurd, btw verlegd", async () => {
    h.freelancer = werker({ country: "BE" });
    h.fiscal = { workerKind: "zzp", vatValid: true, korApplies: false };
    await approveTimesheet({ timesheetId: "ts1", principal });
    const f = werkerFactuur();
    expect(f?.vatTreatment).toBe("REVERSE_CHARGE");
    expect(f?.vatCents).toBe(0);
    expect(f?.lines.create[0]?.description).not.toContain("KOR");
  });

  it("alleen een geldig KVK-nummer: goedgekeurd, met 21% btw zoals altijd", async () => {
    h.freelancer = werker({ kvkValid: true });
    h.fiscal = { workerKind: "zzp", vatValid: false, korApplies: false };
    await approveTimesheet({ timesheetId: "ts1", principal });
    const f = werkerFactuur();
    expect(f?.vatTreatment).toBe("STANDARD_RATE");
    expect(f?.vatCents).toBe(Math.round(16_000 * 0.21));
  });

  it("KVK en btw (zoals vóór 21 nov): ongewijzigd, 21% btw", async () => {
    h.freelancer = werker({ kvkValid: true, vatValid: true });
    h.fiscal = { workerKind: "zzp", vatValid: true, korApplies: false };
    await approveTimesheet({ timesheetId: "ts1", principal });
    expect(werkerFactuur()?.vatTreatment).toBe("STANDARD_RATE");
  });

  it("niets van de drie: de poort blijft dicht, geen factuur en geen betaling", async () => {
    await expect(approveTimesheet({ timesheetId: "ts1", principal })).rejects.toThrow(WERKER_BEDRIJF_MIST);
    expect(h.facturen).toHaveLength(0);
    expect(h.betalingen).toHaveLength(0);
  });
});

describe("punt 1: de regels zelf (puur)", () => {
  it("bedrijf ok: KVK, btw (profiel of fiscaal) of KOR", () => {
    expect(bedrijfOk({ kvkValid: true, vatValid: false }, {})).toBe(true);
    expect(bedrijfOk({ kvkValid: false, vatValid: true }, {})).toBe(true);
    expect(bedrijfOk({ kvkValid: false, vatValid: false }, { vatValid: true })).toBe(true);
    expect(bedrijfOk(null, { korApplies: true })).toBe(true);
    expect(bedrijfOk({ kvkValid: false, vatValid: false }, { vatValid: false, korApplies: false })).toBe(false);
    expect(bedrijfOk(null, {})).toBe(false);
  });

  it("geen btw door de KOR: bij een flexwerker wint de KOR, bij een zzp'er een geldig btw-nummer (zoals lib/payroll/compute.ts)", () => {
    expect(korZonderBtw({ workerKind: "flexwerker", korApplies: true }, false)).toBe(true);
    expect(korZonderBtw({ workerKind: "flexwerker", korApplies: true }, true)).toBe(true);
    expect(korZonderBtw({ workerKind: "zzp", korApplies: true }, false)).toBe(true);
    expect(korZonderBtw({ workerKind: "zzp", korApplies: true }, true)).toBe(false);
    expect(korZonderBtw({ workerKind: "flexwerker", korApplies: false }, false)).toBe(false);
  });

  const basis = {
    timesheetId: "ts1",
    billableMinutes: 480,
    hourlyRateCents: 3000,
    freelancerId: "fp1",
    recipientTenantId: "t1",
    platformTenantId: "zf",
    shiftTitle: "Bediening",
    workedOn: new Date("2026-08-20T09:00:00+02:00"),
    freelancerInvoiceNumber: "SB-1",
    platformInvoiceNumber: "PF-1",
    recipientCountry: "NL",
    freelancerVatValid: false,
  };

  it("de factuur met de KOR: geen btw, ook niet op extra kosten (het ingevoerde bedrag is het hele bedrag)", () => {
    const r = buildReverseBillingInvoices({ ...basis, freelancerCountry: "NL", freelancerKor: true, extraCostsGrossCents: 1_210, extraCostsNote: "Parkeren" });
    expect(r.freelancerInvoice.vatTreatment).toBe("OUT_OF_SCOPE");
    expect(r.freelancerInvoice.vatCents).toBe(0);
    expect(r.freelancerInvoice.lines[1]?.unitPriceCents).toBe(1_210);
    expect(r.freelancerInvoice.totalCents).toBe(24_000 + 1_210);
    expect(r.freelancerInvoice.lines[0]?.description).toContain(KOR_VERMELDING);
    // de platformkosten aan het bedrijf veranderen niet
    expect(r.platformFeeInvoice.vatTreatment).toBe("STANDARD_RATE");
  });

  it("de KOR is Nederlands: een werker uit een ander land krijgt de gewone btw-regels", () => {
    const r = buildReverseBillingInvoices({ ...basis, freelancerCountry: "BE", freelancerVatValid: true, freelancerKor: true });
    expect(r.freelancerInvoice.vatTreatment).toBe("REVERSE_CHARGE");
    expect(r.freelancerInvoice.lines[0]?.description).not.toContain(KOR_VERMELDING);
  });

  it("zonder KOR blijft alles zoals het was", () => {
    const r = buildReverseBillingInvoices({ ...basis, freelancerCountry: "NL", freelancerVatValid: true });
    expect(r.freelancerInvoice.vatTreatment).toBe("STANDARD_RATE");
    expect(r.freelancerInvoice.vatCents).toBe(5_040);
  });
});

describe("punt 5: 'We hebben hem een bericht gestuurd' klopt altijd", () => {
  it("zonder KVK, btw of KOR: push én mail (ook als de push niemand bereikt), en de werkgever leest de gewone zin", async () => {
    const fout = await approveTimesheet({ timesheetId: "ts1", principal }).catch((e: unknown) => e);
    expect(fout).toBeInstanceOf(AppError);
    expect((fout as AppError).message).toBe(WERKER_BEDRIJF_MIST);
    expect(h.pushes).toHaveLength(1);
    expect(h.pushes[0]?.ids).toEqual(["u1"]);
    expect(h.mails).toHaveLength(1);
    expect(h.mails[0]).toMatchObject({ to: "sem@zekerflex.test", kind: "uren-bedrijf-mist" });
    expect(h.mails[0]?.text).toContain("/dashboard/verificatie#gegevens-later-kop");
    expect(h.mails[0]?.text).toContain("KOR");
  });

  it("de mail in de app-taal van de werker", async () => {
    h.taal = "pl";
    await approveTimesheet({ timesheetId: "ts1", principal }).catch(() => undefined);
    expect(h.mails[0]?.subject).toBe("Twoje godziny czekają: uzupełnij dane firmy");
  });

  it("valt de push weg, dan gaat de mail toch", async () => {
    h.pushFout = true;
    await approveTimesheet({ timesheetId: "ts1", principal }).catch(() => undefined);
    expect(h.mails).toHaveLength(1);
  });

  it("één keer per urenbriefje: een tweede poging stuurt niets nieuws (het eerste bericht is al verstuurd)", async () => {
    h.eenmalig = false;
    await expect(approveTimesheet({ timesheetId: "ts1", principal })).rejects.toThrow(WERKER_BEDRIJF_MIST);
    expect(h.pushes).toHaveLength(0);
    expect(h.mails).toHaveLength(0);
  });
});
