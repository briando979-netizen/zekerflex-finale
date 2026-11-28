import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// Kiezen bij een klus in België (lib/matching/apply.ts, 28 nov 2026): het bedrijf is de werkgever en kiest zelf. Een werker
// reageert, maar neemt nooit zelf een plek; het bedrijf kiest pas na de soort contract en zijn bevestiging dat het de werkgever is
// en de Dimona doet. De eisen van ZekerFlex als uitbetaler (KVK, IBAN) gelden dan niet. In Nederland verandert niets.

const h = vi.hoisted(() => ({ belgieKlus: null as unknown }));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (k === "belgie:klus:k1" ? h.belgieKlus : null),
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
import { FOUTEN } from "@/lib/i18n/fouten";

const lees = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8").split("\r\n").join("\n");
const profiel = { id: "fp1", kvkValid: false, isBlacklisted: false, matchingBlockedUntil: null, homeLatitude: 51.2, homeLongitude: 4.4, user: { kycStatus: "VERIFIED", email: "werker@example.test" } };
const klus = (postalCode: string) => ({
  id: "k1",
  status: "OPEN",
  startsAt: new Date(Date.now() + 86_400_000),
  endsAt: new Date(Date.now() + 90_000_000),
  breakMinutes: 0,
  positions: 1,
  viaUitzendbureau: false,
  visibility: "PUBLIC",
  title: "Bediening terras",
  createdAt: new Date(),
  branch: { tenantId: "bedrijf1", postalCode, latitude: 51.22, longitude: 4.4, geofenceRadiusMeters: 150, tenant: { name: "Brasserie De Meir" } },
  _count: { assignments: 0 },
});
const zonderKvk = { ok: false, track: "invoice", reason: "Vul je KVK-nummer in.", sleutel: "elig.kvk" };
const bevestigd = { soort: "student", horeca: false, bevestiging: { door: "m1", op: "2026-11-28T10:00:00.000Z", dimona: "STU" }, vinkjes: [] };

afterEach(() => {
  vi.clearAllMocks();
  h.belgieKlus = null;
});

describe("een klus in België", () => {
  it("een werker neemt zelf geen plek, ook niet via een automatische regel: hij reageert en het bedrijf kiest", async () => {
    h.belgieKlus = bevestigd;
    freelancerProfileFindUnique.mockResolvedValue(profiel);
    payoutEligibility.mockResolvedValue({ ok: true, track: "invoice" });
    shiftFindUnique.mockResolvedValue(klus("BE-2000"));
    await expect(applyToShift("u1", "k1")).rejects.toThrow(FOUTEN["apply.belgieBedrijfKiest"]!.nl);
    expect(shiftMatchUpsert).not.toHaveBeenCalled();
    expect(recordOfferResponse).not.toHaveBeenCalled();
  });

  it("het bedrijf kiest pas na de soort contract en zijn bevestiging", async () => {
    freelancerProfileFindUnique.mockResolvedValue(profiel);
    payoutEligibility.mockResolvedValue({ ok: true, track: "invoice" });
    shiftFindUnique.mockResolvedValue(klus("BE-2000"));
    await expect(applyToShift("u1", "k1", { doorBedrijf: true })).rejects.toThrow(FOUTEN["apply.belgieBevestiging"]!.nl);
    h.belgieKlus = { ...bevestigd, bevestiging: null };
    await expect(applyToShift("u1", "k1", { doorBedrijf: true })).rejects.toThrow(FOUTEN["apply.belgieBevestiging"]!.nl);
    expect(recordOfferResponse).not.toHaveBeenCalled();
  });

  it("na de bevestiging plant het bedrijf de werker in, zonder de Nederlandse eisen (KVK, IBAN)", async () => {
    h.belgieKlus = bevestigd;
    freelancerProfileFindUnique.mockResolvedValue(profiel);
    payoutEligibility.mockResolvedValue(zonderKvk);
    shiftFindUnique.mockResolvedValue(klus("BE-2000"));
    shiftAssignmentFindUnique.mockResolvedValue(null);
    const r = await applyToShift("u1", "k1", { doorBedrijf: true });
    expect(r.status).toBe("ACCEPTED");
    expect(recordOfferResponse).toHaveBeenCalledWith("k1", "fp1", "ACCEPTED");
  });
});

describe("een klus in Nederland verandert niet", () => {
  it("de eisen van ZekerFlex blijven gelden, ook als het bedrijf kiest", async () => {
    freelancerProfileFindUnique.mockResolvedValue(profiel);
    payoutEligibility.mockResolvedValue(zonderKvk);
    shiftFindUnique.mockResolvedValue(klus("1012 AB"));
    await expect(applyToShift("u1", "k1", { doorBedrijf: true })).rejects.toThrow("Vul je KVK-nummer in.");
    await expect(applyToShift("u1", "k1")).rejects.toThrow("Vul je KVK-nummer in.");
  });

  it("een werker met alle gegevens neemt de klus gewoon aan, zoals altijd", async () => {
    freelancerProfileFindUnique.mockResolvedValue(profiel);
    payoutEligibility.mockResolvedValue({ ok: true, track: "invoice" });
    shiftFindUnique.mockResolvedValue(klus("1012 AB"));
    shiftAssignmentFindUnique.mockResolvedValue(null);
    expect((await applyToShift("u1", "k1")).status).toBe("ACCEPTED");
  });
});

describe("de andere wegen naar een plek (bron)", () => {
  it("de matching plant niemand automatisch in en stuurt geen aanbod met één tik", () => {
    const engine = lees("lib/matching/engine.ts");
    expect(engine).toContain("const uitzendPartner = (await isUitzendPartnerTenant(shift.branch.tenantId)) || isBelgischeKlus(shift.branch.postalCode);");
    expect(engine).toContain("if (!uitzendPartner && aa?.enabled");
    expect(engine).toContain("if (seatsAfterAuto > 0 && !uitzendPartner)");
  });

  it("accepteren door het bedrijf vraagt de bevestiging; aanbod, vervanging en spoedoproep geven geen plek", () => {
    const acties = lees("app/werkgever/diensten/[shiftId]/actions.ts");
    expect(acties).toContain("belgieKiesReden(belgieKlus)");
    expect(acties).toContain("await applyToShift(offer.userId, shift.id, { doorBedrijf: true })");
    expect(lees("app/api/shifts/[shiftId]/offer/route.ts")).toContain('metSleutel("apply.belgieBedrijfKiest")');
    expect(lees("lib/replacements/reassign.ts")).toContain("isBelgischeKlus(dienst.branch?.postalCode)");
    expect(lees("app/werkgever/diensten/[shiftId]/page.tsx")).toContain("!belgie && <SpoedoproepPaneel");
    // geen Nederlandse modelovereenkomst (zzp, Wet DBA) bij een werknemer van een Belgisch bedrijf
    expect(lees("lib/notifications/dispatcher.ts")).toContain("if (!isBelgischeKlus(shift.branch.postalCode)) await ensureModelAgreement(tx, {");
    // de loonrun van ZekerFlex slaat uren in België over
    expect(lees("lib/payroll/engine.ts")).toContain("if (isBelgischeKlus(t.branch?.postalCode)) continue;");
  });
});
