import { afterEach, describe, expect, it, vi } from "vitest";

// Punt 4 van de review van de proefklussen (21 nov 2026), de bedrading: alleen wie op een proefklus leunt (payoutEligibility
// gaf `proef`) krijgt het slot per werker in de transactie (recordOfferResponse → voorAanmaken → eisProefklusInSlot). Wie alle
// gegevens heeft, of een klus van een uitzendpartner aanneemt, gaat zonder slot: een storing daarin raakt hem nooit.
// De nagebootste gelijktijdigheid zelf staat in tests/proefklussen-slot.test.ts.

const h = vi.hoisted(() => ({ partner: false }));

const freelancerProfileFindUnique = vi.fn();
const shiftFindUnique = vi.fn();
vi.mock("@/lib/company/verified", () => ({ isTenantVerified: async () => true, assertMayPlaceShift: async () => ({ test: false }), UNVERIFIED_ASSIGN_MESSAGE: "x" }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    freelancerProfile: { findUnique: (...a: unknown[]) => freelancerProfileFindUnique(...a) },
    shift: { findUnique: (...a: unknown[]) => shiftFindUnique(...a) },
    shiftMatch: { upsert: async () => undefined },
    shiftAssignment: { findUnique: async () => null, findFirst: async () => null },
  },
}));

const payoutEligibility = vi.fn();
const eisProefklusInSlot = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/fiscal/eligibility", () => ({
  payoutEligibility: (...a: unknown[]) => payoutEligibility(...a),
  eisProefklusInSlot: (...a: unknown[]) => eisProefklusInSlot(...a),
}));
vi.mock("@/lib/uitzend/partners", () => ({ isUitzendPartnerTenant: async () => h.partner }));
vi.mock("@/lib/employer/relations", () => ({ isBlockedByAny: async () => false }));

const recordOfferResponse = vi.fn().mockResolvedValue({ status: "ACCEPTED", shiftFilled: false });
vi.mock("@/lib/notifications/dispatcher", () => ({ recordOfferResponse: (...a: unknown[]) => recordOfferResponse(...a) }));

import { applyToShift } from "@/lib/matching/apply";
import { isWerkerNietKlaar } from "@/lib/fiscal/werker-niet-klaar";
import { AppError } from "@/lib/errors";

const profile = { id: "fp1", kvkValid: false, isBlacklisted: false, matchingBlockedUntil: null, homeLatitude: 52.0, homeLongitude: 5.0, user: { kycStatus: "VERIFIED" } };
const shift = {
  id: "shift1",
  status: "OPEN",
  startsAt: new Date(Date.now() + 86_400_000),
  positions: 2,
  viaUitzendbureau: false,
  branch: { tenantId: "org1", latitude: 52.1, longitude: 5.1, geofenceRadiusMeters: 500 },
  _count: { assignments: 0 },
};

afterEach(() => {
  vi.clearAllMocks();
  h.partner = false;
});

describe("applyToShift: het slot alleen op het proefpad", () => {
  it("met alle gegevens: geen slot, recordOfferResponse zoals altijd", async () => {
    freelancerProfileFindUnique.mockResolvedValue(profile);
    shiftFindUnique.mockResolvedValue(shift);
    payoutEligibility.mockResolvedValue({ ok: true, track: "invoice", reason: null });
    await applyToShift("u1", "shift1");
    expect(recordOfferResponse).toHaveBeenCalledWith("shift1", "fp1", "ACCEPTED");
  });

  it("op een proefklus: het slot per werker zit in de transactie, vlak vóór het aanmaken", async () => {
    freelancerProfileFindUnique.mockResolvedValue(profile);
    shiftFindUnique.mockResolvedValue(shift);
    payoutEligibility.mockResolvedValue({ ok: true, track: "invoice", reason: null, proef: { over: 1 } });
    await applyToShift("u1", "shift1");
    expect(recordOfferResponse).toHaveBeenCalledWith("shift1", "fp1", "ACCEPTED", { voorAanmaken: expect.any(Function) });
    const opts = recordOfferResponse.mock.calls[0]?.[3] as { voorAanmaken: (tx: unknown) => Promise<void> };
    const tx = { naam: "transactie" };
    await opts.voorAanmaken(tx);
    expect(eisProefklusInSlot).toHaveBeenCalledWith(tx, "u1");
  });

  it("een klus van een uitzendpartner: geen slot, ook niet met proefruimte", async () => {
    h.partner = true;
    freelancerProfileFindUnique.mockResolvedValue(profile);
    shiftFindUnique.mockResolvedValue(shift);
    payoutEligibility.mockResolvedValue({ ok: true, track: "invoice", reason: null, proef: { over: 1 } });
    await applyToShift("u1", "shift1");
    expect(recordOfferResponse).toHaveBeenCalledWith("shift1", "fp1", "ACCEPTED");
  });

  it("niet klaar: 412 met de reden en sleutel voor de werker, gemerkt voor de werkgever", async () => {
    freelancerProfileFindUnique.mockResolvedValue(profile);
    shiftFindUnique.mockResolvedValue(shift);
    payoutEligibility.mockResolvedValue({ ok: false, track: "invoice", reason: "Je hebt je eerste 2 klussen aangenomen.", sleutel: "elig.proefOp" });
    const fout = await applyToShift("u1", "shift1").catch((e: unknown) => e);
    expect(fout).toBeInstanceOf(AppError);
    expect((fout as AppError).status).toBe(412);
    expect((fout as AppError).message).toBe("Je hebt je eerste 2 klussen aangenomen.");
    expect((fout as AppError).sleutel).toBe("elig.proefOp");
    expect(isWerkerNietKlaar(fout)).toBe(true);
    expect(recordOfferResponse).not.toHaveBeenCalled();
  });

  it("andere fouten (vol, overlap) zijn niet gemerkt", () => {
    expect(isWerkerNietKlaar(AppError.conflict("Deze dienst is al vol."))).toBe(false);
    expect(isWerkerNietKlaar(new Error("x"))).toBe(false);
  });
});
