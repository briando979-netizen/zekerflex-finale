import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// Uitzendpartners (21 nov 2026): bij een klus van een uitzendpartner is het bureau de werkgever. Iedereen mag een
// uitzendcontract aanvragen (geen KVK, IBAN of ZekerFlex-uitzendovereenkomst nodig), het bureau krijgt de contactgegevens,
// en bij goedkeuren stuurt ZekerFlex alleen de factuur voor de platformkosten: geen uitbetaling, geen loonstrook.

const h = vi.hoisted(() => ({ partners: {} as Record<string, string> }));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (k === "systeem:uitzendpartners" ? h.partners : null),
  kvSet: async () => undefined,
}));
const freelancerProfileFindUnique = vi.fn();
const shiftFindUnique = vi.fn();
const shiftMatchUpsert = vi.fn();
const shiftAssignmentFindUnique = vi.fn();
vi.mock("@/lib/company/verified", () => ({ isTenantVerified: async () => true, assertMayPlaceShift: async () => ({ test: false }), UNVERIFIED_ASSIGN_MESSAGE: "x" }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    freelancerProfile: { findUnique: (...a: unknown[]) => freelancerProfileFindUnique(...a) },
    shift: { findUnique: (...a: unknown[]) => shiftFindUnique(...a) },
    shiftMatch: { upsert: (...a: unknown[]) => shiftMatchUpsert(...a) },
    shiftAssignment: { findUnique: (...a: unknown[]) => shiftAssignmentFindUnique(...a), findFirst: async () => null },
  },
}));
const payoutEligibility = vi.fn();
vi.mock("@/lib/fiscal/eligibility", () => ({ payoutEligibility: (...a: unknown[]) => payoutEligibility(...a) }));
vi.mock("@/lib/employer/relations", () => ({ isBlockedByAny: async () => false }));
const recordOfferResponse = vi.fn().mockResolvedValue({ status: "ACCEPTED", shiftFilled: false });
vi.mock("@/lib/notifications/dispatcher", () => ({ recordOfferResponse: (...a: unknown[]) => recordOfferResponse(...a) }));
vi.mock("@/lib/onboarding/werker-poort-server", () => ({ eisOnboardingVoorReageren: async () => undefined }));

import { applyToShift } from "@/lib/matching/apply";
import { buildPlatformFeeInvoice } from "@/lib/billing/self-billing";
import { approvedPushText } from "@/lib/notifications/approved-push";
import { WORKER_PUSH } from "@/lib/i18n/worker-push";
import { aanvraagMail } from "@/lib/uitzend/aanvraag-tekst";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";
import { isMatchEligibleWorker } from "@/lib/matching/geschikt";

const lees = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");
const profiel = { id: "fp1", kvkValid: false, isBlacklisted: false, matchingBlockedUntil: null, homeLatitude: 53.2, homeLongitude: 6.5, user: { kycStatus: "VERIFIED", email: "werker@example.test" } };
const klus = {
  id: "k1",
  status: "OPEN",
  startsAt: new Date(Date.now() + 86_400_000),
  endsAt: new Date(Date.now() + 90_000_000),
  breakMinutes: 0,
  positions: 1,
  viaUitzendbureau: true,
  visibility: "PUBLIC",
  title: "Magazijnmedewerker",
  createdAt: new Date(),
  branch: { tenantId: "bureau1", latitude: 53.21, longitude: 6.56, geofenceRadiusMeters: 150, tenant: { name: "Bureau Noord" } },
  _count: { assignments: 0 },
};

afterEach(() => {
  vi.clearAllMocks();
  h.partners = {};
  (globalThis as { __zfUitzendPartners?: unknown }).__zfUitzendPartners = undefined;
});

describe("reageren op een klus van een uitzendpartner", () => {
  it("een zzp'er zonder KVK of IBAN mag een uitzendcontract aanvragen bij een partner", async () => {
    h.partners = { bureau1: "2026-11-21T03:00:00.000Z" };
    freelancerProfileFindUnique.mockResolvedValue(profiel);
    payoutEligibility.mockResolvedValue({ ok: false, track: "invoice", reason: "Vul je KVK-nummer in.", sleutel: "elig.kvk" });
    shiftFindUnique.mockResolvedValue(klus);
    shiftAssignmentFindUnique.mockResolvedValue(null);
    const r = await applyToShift("u1", "k1");
    expect(r.status).toBe("ACCEPTED");
  });

  it("zonder partner blijven de eisen van ZekerFlex gelden", async () => {
    freelancerProfileFindUnique.mockResolvedValue(profiel);
    payoutEligibility.mockResolvedValue({ ok: false, track: "invoice", reason: "Vul je KVK-nummer in.", sleutel: "elig.kvk" });
    shiftFindUnique.mockResolvedValue(klus);
    await expect(applyToShift("u1", "k1")).rejects.toThrow("Vul je KVK-nummer in.");
    expect(recordOfferResponse).not.toHaveBeenCalled();
  });

  it("de matching laat iedereen toe bij een partner, en plant niemand automatisch in", async () => {
    expect(await isMatchEligibleWorker({ userId: "u1", vatValid: false, kvkValid: false, country: "NL" }, true, true)).toBe(true);
    const engine = lees("lib/matching/engine.ts");
    expect(engine).toContain("if (!uitzendPartner && aa?.enabled");
    expect(engine).toContain("if (seatsAfterAuto > 0 && !uitzendPartner)");
  });
});

describe("geld bij een klus van een uitzendpartner", () => {
  it("alleen een PLATFORM_FEE-factuur aan het bureau, per gewerkt uur", () => {
    const f = buildPlatformFeeInvoice({
      timesheetId: "ts1",
      billableMinutes: 480,
      recipientTenantId: "bureau1",
      recipientCountry: "NL",
      recipientVatValidForReverseCharge: false,
      platformTenantId: "zf",
      shiftTitle: "Shift @ Magazijn",
      invoiceNumber: "PF-1",
      platformFeePerHourCents: 350,
    });
    expect(f.type).toBe("PLATFORM_FEE");
    expect(f.recipientTenantId).toBe("bureau1");
    expect(f.subtotalCents).toBe(2800);
    expect(f.issuerFreelancerId).toBeUndefined();
  });

  it("goedkeuren gaat bij een partner vóór de keuze op de werker, zonder uitbetaling of loonstrook", () => {
    const bron = lees("lib/timesheets/approve.ts");
    const fork = bron.indexOf("if (await isUitzendPartnerTenant(ts.branch.tenantId))");
    expect(fork).toBeGreaterThan(0);
    expect(fork).toBeLessThan(bron.indexOf('if (invoiceModeFor(fiscal) === "payroll")'));
    const partnerDeel = bron.slice(bron.indexOf("async function approveViaPartner"), bron.indexOf("Uitzendkracht track: no invoice"));
    expect(partnerDeel.length).toBeGreaterThan(500);
    expect(partnerDeel).toContain("buildPlatformFeeInvoice");
    expect(partnerDeel).not.toContain("dispatchPayout");
    expect(partnerDeel).not.toContain("payment.create");
    expect(partnerDeel).not.toContain("createPayrollAdvance");
    expect(lees("lib/payroll/engine.ts")).toContain("if (isUitzendPartner(partners, t.branch?.tenantId)) continue;");
  });

  it("de werker hoort dat het loon van het bureau komt, in alle vijf de talen", () => {
    for (const taal of ["nl", "en", "pl", "ro", "uk"] as const) {
      const t = WORKER_PUSH[taal];
      const { body } = approvedPushText({ timesheetId: "ts1", billableMinutes: 480, track: "partner", payout: null, payroll: null, advance: null }, "Magazijn", t);
      expect(body, taal).toContain(t.approvedPartner);
      expect(body, taal).not.toContain(t.approvedSpeed);
    }
  });
});

describe("de aanvraag bij het bureau", () => {
  it("de mail noemt naam, e-mail en telefoon, en verder niets over de persoon", () => {
    const m = aanvraagMail({
      bureau: "Bureau Noord",
      werker: { naam: "Sem Visser", email: "sem@example.test", telefoon: null },
      klus: { titel: "Magazijnmedewerker", wanneer: "di 24 nov 10:00" },
      link: "https://zekerflex.com/werkgever/diensten/k1",
    });
    expect(m.subject).toBe("Aanvraag uitzendcontract: Sem Visser voor Magazijnmedewerker");
    expect(m.text).toContain("sem@example.test");
    expect(m.text).toContain("Telefoon: niet ingevuld");
    expect(m.text).not.toMatch(/BSN|geboorte|IBAN/i);
  });

  it("de knop, de toestemming en de chips staan in alle vijf de talen en noemen het bureau", () => {
    for (const taal of ["nl", "en", "pl", "ro", "uk"] as const) {
      const d = FREELANCER_DICTS[taal].detail;
      expect(d.partnerKnop.length, taal).toBeGreaterThan(5);
      expect(d.partnerToestemming, taal).toContain("{bureau}");
      expect(d.partnerVia, taal).toContain("{bureau}");
      expect(d.partnerChips[0], taal).toContain("{bureau}");
      expect(d.partnerChips, taal).toHaveLength(FREELANCER_DICTS.nl.market.typeUitzend.length);
    }
    const pagina = lees("app/dashboard/klussen/[shiftId]/page.tsx");
    expect(pagina).toContain("label: D.partnerKnop, toestemming: metBureau(D.partnerToestemming)");
  });
});
