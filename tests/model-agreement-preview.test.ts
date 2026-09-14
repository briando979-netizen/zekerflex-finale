import { afterEach, describe, expect, it, vi } from "vitest";

// "Ik ga akkoord met de overeenkomst" in the reageer flow used to link to
// nothing at all for a first-time client — no ModelAgreement row exists
// until a freelancer is actually selected. This previews what one would
// say, without persisting anything.
const shiftFindUnique = vi.fn();
const freelancerProfileFindFirst = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    shift: { findUnique: (...a: unknown[]) => shiftFindUnique(...a) },
    freelancerProfile: { findFirst: (...a: unknown[]) => freelancerProfileFindFirst(...a) },
  },
}));

import { previewAgreementPdf } from "@/lib/pdf/documents";

const SHIFT = {
  title: "Vakkenvuller",
  startsAt: new Date("2026-10-01T09:00:00Z"),
  breakMinutes: 30,
  hourlyRateCents: 1650,
  branch: {
    addressLine: "Hoofdstraat 1",
    postalCode: "1234 AB",
    city: "Amsterdam",
    tenant: { name: "Supermarkt BV", kvkNumber: "12345678", companyRegistration: null },
  },
};

const PROFILE = {
  kvkNumber: "87654321",
  user: { fullName: "Jan Jansen" },
  companyRegistration: null,
};

afterEach(() => vi.clearAllMocks());

describe("previewAgreementPdf", () => {
  it("returns a non-empty PDF for a real shift + freelancer", async () => {
    shiftFindUnique.mockResolvedValue(SHIFT);
    freelancerProfileFindFirst.mockResolvedValue(PROFILE);

    const doc = await previewAgreementPdf("shift1", "user1");

    expect(doc).not.toBeNull();
    expect(doc!.bytes.length).toBeGreaterThan(500);
    expect(doc!.bytes.subarray(0, 4).toString()).toBe("%PDF");
    expect(doc!.filename).toBe("modelovereenkomst-concept.pdf");
  });

  it("returns null when the shift doesn't exist", async () => {
    shiftFindUnique.mockResolvedValue(null);

    expect(await previewAgreementPdf("missing", "user1")).toBeNull();
    expect(freelancerProfileFindFirst).not.toHaveBeenCalled();
  });

  it("returns null when the caller has no freelancer profile", async () => {
    shiftFindUnique.mockResolvedValue(SHIFT);
    freelancerProfileFindFirst.mockResolvedValue(null);

    expect(await previewAgreementPdf("shift1", "user1")).toBeNull();
  });
});
