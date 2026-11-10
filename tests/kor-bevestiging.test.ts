import { describe, expect, it, vi } from "vitest";
import { KOR_BEVESTIGING } from "@/lib/fiscal/kor";

// De bevestiging van de Belastingdienst goedkeuren (Admin → gebruiker → Documenten) zet de KOR aan.

// --- goedkeuren door een medewerker zet de KOR aan ------------------------------

const h = vi.hoisted(() => ({ fiscalPatches: [] as unknown[] }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    complianceDocument: {
      findFirst: async () => ({ id: "d1", kind: "OTHER", note: "kor-bevestiging" }),
      update: async () => ({
        id: "d1",
        kind: "OTHER",
        status: "APPROVED",
        note: "kor-bevestiging",
        uploadedAt: new Date("2026-11-10T10:00:00Z"),
        upload: { filename: "brief.pdf", mimeType: "application/pdf", sizeBytes: 10 },
      }),
    },
  },
}));
vi.mock("@/lib/storage/local", () => ({ storeUpload: async () => ({ id: "u1" }), readUpload: async () => null }));
vi.mock("@/lib/kyc/bank-login", () => ({ bankLoginProvesIban: async () => false, clearBankLogin: async () => undefined }));
vi.mock("@/lib/fiscal/store", () => ({
  getFiscal: async () => ({ korAanvraag: { stand: "ingediend", ingang: "2027-01-01", ingediendOp: "x", omzetDitJaarCent: 1, omzetVorigJaarCent: 0 } }),
  setFiscal: async (_u: string, patch: unknown) => {
    h.fiscalPatches.push(patch);
    return patch;
  },
}));

describe("KOR-bevestiging goedkeuren", () => {
  it("zet korApplies aan en de aanvraag op bevestigd", async () => {
    const { setDocStatus } = await import("@/lib/compliance/documents");
    const doc = await setDocStatus("u1", "d1", "approved");
    expect(doc?.note).toBe(KOR_BEVESTIGING);
    expect(h.fiscalPatches).toContainEqual(expect.objectContaining({ korApplies: true, korAanvraag: expect.objectContaining({ stand: "bevestigd" }) }));
  });
});
