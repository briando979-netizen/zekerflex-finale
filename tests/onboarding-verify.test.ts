import { afterEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Freelancer self-serve onboarding used to accept one generic "document"
// upload and left a *second*, separate "Identiteitsbewijs" upload requirement
// in ComplianceDocsPanel untouched — a freelancer had to hand over their ID
// twice. These tests lock in the fix: three captures (front/back/selfie) in
// one submission, and the front photo auto-satisfies the compliance "id" doc
// so ComplianceDocsPanel never re-asks for it.
// ---------------------------------------------------------------------------

const userFindUnique = vi.fn();
const userUpdate = vi.fn();
const freelancerProfileUpdate = vi.fn().mockResolvedValue({});
const ivCreate = vi.fn();
const complianceDeleteMany = vi.fn();
const complianceCreate = vi.fn();
const txn = vi.fn(async (fn: (tx: unknown) => unknown) =>
  fn({
    identityVerification: { create: (...a: unknown[]) => ivCreate(...a) },
    user: { update: (...a: unknown[]) => userUpdate(...a) },
    complianceDocument: {
      deleteMany: (...a: unknown[]) => complianceDeleteMany(...a),
      create: (...a: unknown[]) => complianceCreate(...a),
    },
  }),
);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    freelancerProfile: { update: (...a: unknown[]) => freelancerProfileUpdate(...a) },
    $transaction: (fn: (tx: unknown) => unknown) => txn(fn),
  },
}));

vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));

vi.mock("@/lib/integrations/pdok", () => ({
  geocodePostcode: vi.fn().mockResolvedValue({
    latitude: 52.37,
    longitude: 4.9,
    postalCode: "1012AB",
    city: "Amsterdam",
    street: "Damrak",
    approximate: false,
  }),
}));

vi.mock("@/lib/company/registration", () => ({
  registerFreelancerCompany: vi.fn(),
}));

let uploadCounter = 0;
vi.mock("@/lib/storage/local", () => ({
  storeUpload: vi.fn(async (input: { filename: string }) => {
    uploadCounter += 1;
    return { id: `up_${uploadCounter}`, filename: input.filename, sha256: `sha_${uploadCounter}` };
  }),
}));

vi.mock("@/lib/ai/client", () => ({
  chatJson: vi.fn().mockResolvedValue({
    verdict: "approved",
    confidence: 0.9,
    reasons: [],
    summary: "Alles klopt.",
  }),
}));

import { submitFreelancerOnboarding } from "@/lib/onboarding/verify";

function image(name: string, size = 20_000): { filename: string; mimeType: string; bytes: Buffer } {
  return { filename: name, mimeType: "image/jpeg", bytes: Buffer.alloc(size, 1) };
}

const BASE_INPUT = {
  userId: "usr_1",
  kvkNumber: "", // uitzendkracht path — skips the KVK/Handelsregister call
  postalCode: "1012 AB",
  houseNumber: "10",
  payoutIban: "NL91ABNA0417164300",
  documentType: "ID_CARD" as const,
  documentNumber: "SPECI2014",
  documentExpiry: "2030-01-01",
  nameOnDocument: "Jan Jansen",
};

afterEach(() => {
  vi.clearAllMocks();
  uploadCounter = 0;
});

describe("submitFreelancerOnboarding — three-capture flow", () => {
  it("rejects when a photo is unreadable (too small) — never reaches storage", async () => {
    userFindUnique.mockResolvedValue({
      id: "usr_1",
      fullName: "Jan Jansen",
      kycStatus: "PENDING",
      freelancerProfile: { id: "fp_1" },
    });

    await expect(
      submitFreelancerOnboarding({
        ...BASE_INPUT,
        files: { front: image("front.jpg"), back: image("back.jpg", 100), selfie: image("selfie.jpg") },
      }),
    ).rejects.toThrow(/niet leesbaar/);

    expect(ivCreate).not.toHaveBeenCalled();
    expect(complianceCreate).not.toHaveBeenCalled();
  });

  it("stores all three photos and auto-fills the compliance ID doc from the front photo", async () => {
    userFindUnique.mockResolvedValue({
      id: "usr_1",
      fullName: "Jan Jansen",
      kycStatus: "PENDING",
      freelancerProfile: { id: "fp_1" },
    });

    const result = await submitFreelancerOnboarding({
      ...BASE_INPUT,
      files: { front: image("front.jpg"), back: image("back.jpg"), selfie: image("selfie.jpg") },
    });

    expect(result.outcome).toBe("verified");

    // One compliance "id" doc, superseding any previous one, pointing at the
    // FRONT upload specifically — not the back or the selfie.
    expect(complianceDeleteMany).toHaveBeenCalledWith({
      where: { userId: "usr_1", kind: "ID" },
    });
    expect(complianceCreate).toHaveBeenCalledWith({
      data: { userId: "usr_1", kind: "ID", uploadId: "up_1" },
    });

    // The identity-verification row references all three uploads.
    const ivArg = ivCreate.mock.calls[0]![0] as { data: { rawPayload: { uploadIds: Record<string, string> } } };
    expect(ivArg.data.rawPayload.uploadIds).toEqual({ front: "up_1", back: "up_2", selfie: "up_3" });
  });

  it("does NOT auto-fill the compliance doc for a driver's license — that slot only accepts passport/ID card", async () => {
    userFindUnique.mockResolvedValue({
      id: "usr_1",
      fullName: "Jan Jansen",
      kycStatus: "PENDING",
      freelancerProfile: { id: "fp_1" },
    });

    await submitFreelancerOnboarding({
      ...BASE_INPUT,
      documentType: "DRIVERS_LICENSE",
      documentNumber: "1234567890",
      files: { front: image("front.jpg"), back: image("back.jpg"), selfie: image("selfie.jpg") },
    });

    expect(complianceDeleteMany).not.toHaveBeenCalled();
    expect(complianceCreate).not.toHaveBeenCalled();
  });
});
