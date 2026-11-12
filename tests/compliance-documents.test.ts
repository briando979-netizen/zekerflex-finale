import { afterEach, describe, expect, it, vi } from "vitest";

// A freelancer could change their payoutIban/fiscal.iban at any time with
// only a checksum check — no document, no admin review, nothing — and the
// UI even claimed "✓ gecontroleerd" regardless. These are the functions that
// now hold payouts on an IBAN change until a fresh bank document is
// uploaded (lib/timesheets/approve.ts and lib/payroll/sepa-export.ts enforce
// the hold; this file manages the flag + the document lifecycle).

const complianceDocumentDeleteMany = vi.fn();
const complianceDocumentFindFirst = vi.fn();
const complianceDocumentCreate = vi.fn();
const complianceDocumentUpdate = vi.fn();
const freelancerProfileUpdate = vi.fn();
// standaard geen oude documenten; een test kan dat per aanroep zetten
const complianceDocumentFindMany = vi.fn().mockResolvedValue([]);
const identityVerificationFindMany = vi.fn().mockResolvedValue([]);
const deleteUpload = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    complianceDocument: {
      deleteMany: (...a: unknown[]) => complianceDocumentDeleteMany(...a),
      findFirst: (...a: unknown[]) => complianceDocumentFindFirst(...a),
      create: (...a: unknown[]) => complianceDocumentCreate(...a),
      update: (...a: unknown[]) => complianceDocumentUpdate(...a),
      findMany: (...a: unknown[]) => complianceDocumentFindMany(...a),
    },
    freelancerProfile: { update: (...a: unknown[]) => freelancerProfileUpdate(...a) },
    workRight: { findMany: async () => [] },
    certificate: { findMany: async () => [] },
    identityVerification: { findMany: (...a: unknown[]) => identityVerificationFindMany(...a) },
  },
}));

vi.mock("@/lib/storage/local", () => ({
  storeUpload: vi.fn().mockResolvedValue({ id: "upload1" }),
  readUpload: vi.fn(),
  deleteUpload: (...a: unknown[]) => deleteUpload(...a),
}));
vi.mock("@/lib/storage/validate", () => ({
  sniffAndVerifyUploadType: vi.fn().mockReturnValue("application/pdf"),
}));

// Real getFiscal/setFiscal, backed by an in-memory fake of the KV store they
// call — exercises the actual merge logic instead of re-mocking it by hand.
const kv = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (key: string) => kv.get(key) ?? null,
  kvSet: async (key: string, value: unknown) => {
    kv.set(key, value);
  },
  kvListEntries: async () => [],
}));

import { storeDoc, setDocStatus, invalidateBankDoc, flagIbanChanged } from "@/lib/compliance/documents";
import { getFiscal, setFiscal } from "@/lib/fiscal/store";

afterEach(() => {
  vi.clearAllMocks();
  complianceDocumentFindMany.mockResolvedValue([]);
  identityVerificationFindMany.mockResolvedValue([]);
  kv.clear();
});

describe("vervangen documenten ook echt weg", () => {
  it("een nieuw bankafschrift gooit het bestand van het oude weg", async () => {
    // eerst de oude documenten van deze soort, daarna (bij de controle of iets nog in gebruik is) geen
    complianceDocumentFindMany.mockResolvedValueOnce([{ uploadId: "oud-bank" }]).mockResolvedValueOnce([]);
    complianceDocumentCreate.mockResolvedValue({ id: "d1", kind: "BANK", status: "UPLOADED", note: null, uploadedAt: new Date(), upload: { filename: "a.pdf", mimeType: "application/pdf", sizeBytes: 3 } });
    await storeDoc("u1", "bank", { filename: "a.pdf", mimeType: "application/pdf", bytes: Buffer.from("abc") });
    expect(deleteUpload).toHaveBeenCalledWith("oud-bank");
  });

  it("niet als een ID-controle het bestand nog als foto gebruikt (de voorkant is ook het ID-document)", async () => {
    complianceDocumentFindMany.mockResolvedValueOnce([{ uploadId: "voorkant" }]).mockResolvedValueOnce([]);
    identityVerificationFindMany.mockResolvedValue([{ rawPayload: { uploadIds: { front: "voorkant", selfie: "s" } } }]);
    complianceDocumentCreate.mockResolvedValue({ id: "d2", kind: "ID", status: "UPLOADED", note: null, uploadedAt: new Date(), upload: { filename: "id.jpg", mimeType: "image/jpeg", sizeBytes: 3 } });
    await storeDoc("u1", "id", { filename: "id.jpg", mimeType: "image/jpeg", bytes: Buffer.from("abc") });
    expect(deleteUpload).not.toHaveBeenCalled();
  });

  it("een vervallen bankafschrift (nieuw IBAN) gaat ook als bestand weg", async () => {
    complianceDocumentFindMany.mockResolvedValueOnce([{ uploadId: "oud-bank-2" }]).mockResolvedValueOnce([]);
    complianceDocumentDeleteMany.mockResolvedValue({ count: 1 });
    await invalidateBankDoc("u1");
    expect(deleteUpload).toHaveBeenCalledWith("oud-bank-2");
  });
});

describe("invalidateBankDoc", () => {
  it("deletes the BANK-kind compliance document for the user", async () => {
    complianceDocumentDeleteMany.mockResolvedValue({ count: 1 });
    await invalidateBankDoc("u1");
    expect(complianceDocumentDeleteMany).toHaveBeenCalledWith({ where: { userId: "u1", kind: "BANK" } });
  });
});

describe("flagIbanChanged", () => {
  it("invalidates the bank doc and sets the pending flag on both tracks", async () => {
    complianceDocumentDeleteMany.mockResolvedValue({ count: 1 });
    freelancerProfileUpdate.mockResolvedValue({});

    await flagIbanChanged("u1");

    expect(complianceDocumentDeleteMany).toHaveBeenCalledWith({ where: { userId: "u1", kind: "BANK" } });
    expect(freelancerProfileUpdate).toHaveBeenCalledWith({
      where: { userId: "u1" },
      data: { payoutIbanPendingVerification: true },
    });
    const fiscal = await getFiscal("u1");
    expect(fiscal.ibanPendingVerification).toBe(true);
  });

  it("never throws when the user has no FreelancerProfile row (uitzend-only)", async () => {
    complianceDocumentDeleteMany.mockResolvedValue({ count: 0 });
    freelancerProfileUpdate.mockRejectedValue(new Error("no such profile"));

    await expect(flagIbanChanged("u2")).resolves.toBeUndefined();
    const fiscal = await getFiscal("u2");
    expect(fiscal.ibanPendingVerification).toBe(true);
  });
});

describe("storeDoc", () => {
  it("clears the pending-verification flag on both tracks when a new bank document is uploaded", async () => {
    await setFiscal("u1", { ibanPendingVerification: true });
    freelancerProfileUpdate.mockResolvedValue({});
    complianceDocumentDeleteMany.mockResolvedValue({ count: 1 });
    complianceDocumentCreate.mockResolvedValue({
      id: "doc1",
      kind: "BANK",
      status: "UPLOADED",
      note: null,
      uploadedAt: new Date(),
      upload: { filename: "afschrift.pdf", mimeType: "application/pdf", sizeBytes: 1234 },
    });

    await storeDoc("u1", "bank", { filename: "afschrift.pdf", mimeType: "application/pdf", bytes: Buffer.from("x") });

    expect(freelancerProfileUpdate).toHaveBeenCalledWith({
      where: { userId: "u1" },
      data: { payoutIbanPendingVerification: false },
    });
    const fiscal = await getFiscal("u1");
    expect(fiscal.ibanPendingVerification).toBe(false);
  });

  it("does not touch the pending flag for a non-bank document (e.g. an ID upload)", async () => {
    await setFiscal("u1", { ibanPendingVerification: true });
    complianceDocumentCreate.mockResolvedValue({
      id: "doc2",
      kind: "ID",
      status: "UPLOADED",
      note: null,
      uploadedAt: new Date(),
      upload: { filename: "id.pdf", mimeType: "application/pdf", sizeBytes: 1234 },
    });

    await storeDoc("u1", "id", { filename: "id.pdf", mimeType: "application/pdf", bytes: Buffer.from("x") });

    expect(freelancerProfileUpdate).not.toHaveBeenCalled();
    const fiscal = await getFiscal("u1");
    expect(fiscal.ibanPendingVerification).toBe(true);
  });
});

describe("setDocStatus", () => {
  it("re-sets the pending flag when an admin rejects a bank document", async () => {
    complianceDocumentFindFirst.mockResolvedValue({ id: "doc1", kind: "BANK" });
    complianceDocumentUpdate.mockResolvedValue({
      id: "doc1",
      kind: "BANK",
      status: "REJECTED",
      note: null,
      uploadedAt: new Date(),
      upload: { filename: "afschrift.pdf", mimeType: "application/pdf", sizeBytes: 1234 },
    });
    freelancerProfileUpdate.mockResolvedValue({});

    await setDocStatus("u1", "doc1", "rejected");

    expect(freelancerProfileUpdate).toHaveBeenCalledWith({
      where: { userId: "u1" },
      data: { payoutIbanPendingVerification: true },
    });
    const fiscal = await getFiscal("u1");
    expect(fiscal.ibanPendingVerification).toBe(true);
  });

  it("does not touch the pending flag when a bank document is approved", async () => {
    complianceDocumentFindFirst.mockResolvedValue({ id: "doc1", kind: "BANK" });
    complianceDocumentUpdate.mockResolvedValue({
      id: "doc1",
      kind: "BANK",
      status: "APPROVED",
      note: null,
      uploadedAt: new Date(),
      upload: { filename: "afschrift.pdf", mimeType: "application/pdf", sizeBytes: 1234 },
    });

    await setDocStatus("u1", "doc1", "approved");

    expect(freelancerProfileUpdate).not.toHaveBeenCalled();
  });
});
