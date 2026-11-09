import { beforeEach, describe, expect, it, vi } from "vitest";

const userFindUnique = vi.fn();
const userUpdate = vi.fn().mockResolvedValue({});
const ivFindFirst = vi.fn();
const fpUpdate = vi.fn().mockResolvedValue({});
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: userFindUnique, update: userUpdate },
    identityVerification: { findFirst: ivFindFirst },
    freelancerProfile: { update: fpUpdate },
  },
}));
vi.mock("@/lib/env", () => ({ env: { STRIPE_SECRET_KEY: "sk_test", APP_BASE_URL: "https://www.zekerflex.com" } }));
vi.mock("@/lib/billing/stripe", () => ({ getStripeClient: vi.fn() }));
vi.mock("@/lib/fiscal/store", () => ({ getFiscal: vi.fn(), setFiscal: vi.fn().mockResolvedValue(undefined) }));
const kvGet = vi.fn();
const kvSet = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/storage/kv", () => ({ kvGet, kvSet, kvDelete: vi.fn() }));
const recordAudit = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/audit", () => ({ recordAudit }));

const { updatePersonalInfo, NAAM_VAST_BERICHT } = await import("@/lib/profile/personal");
const { getBankLogin } = await import("@/lib/kyc/bank-login");

beforeEach(() => {
  vi.clearAllMocks();
  kvGet.mockResolvedValue(null);
});

describe("naam wijzigen na bevestiging", () => {
  it("weigert een andere naam bij kycStatus VERIFIED met 423 en eigen code, en schrijft een audit", async () => {
    userFindUnique.mockResolvedValue({ fullName: "Jan de Vries", phone: null, kycStatus: "VERIFIED" });
    await expect(updatePersonalInfo("u1", { fullName: "Piet Jansen" })).rejects.toMatchObject({
      status: 423,
      code: "NAAM_VASTGEZET",
      message: NAAM_VAST_BERICHT,
    });
    expect(userUpdate).not.toHaveBeenCalled();
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "user.name_change_blocked" }));
  });

  it("weigert ook bij een bevestigde bank-inlog zonder ID-controle", async () => {
    userFindUnique.mockResolvedValue({ fullName: "Jan de Vries", phone: null, kycStatus: "NOT_STARTED" });
    kvGet.mockResolvedValue({ status: "verified", problems: [], verifiedName: "J DE VRIES", ibanLast4: "1234", bank: null, at: "x", sessionId: "s" });
    await expect(updatePersonalInfo("u1", { fullName: "Piet Jansen" })).rejects.toMatchObject({ status: 423 });
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("laat een andere schrijfwijze van dezelfde naam vrij", async () => {
    userFindUnique.mockResolvedValue({ fullName: "Bilal El Bouti", phone: null, kycStatus: "VERIFIED" });
    await updatePersonalInfo("u1", { fullName: "Bilal Elbouti" });
    expect(userUpdate).toHaveBeenCalledWith({ where: { id: "u1" }, data: { fullName: "Bilal Elbouti", phone: null } });
  });

  it("laat een niet-geverifieerde gebruiker vrij", async () => {
    userFindUnique.mockResolvedValue({ fullName: "Jan de Vries", phone: null, kycStatus: "PENDING" });
    await updatePersonalInfo("u1", { fullName: "Piet Jansen" });
    expect(userUpdate).toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalledWith(expect.objectContaining({ action: "user.name_change_blocked" }));
  });

  it("laat een beheerder een vaste naam wel wijzigen, met audit", async () => {
    userFindUnique.mockResolvedValue({ fullName: "Jan de Vries", phone: null, kycStatus: "VERIFIED" });
    await updatePersonalInfo("u1", { fullName: "Piet Jansen" }, { byAdmin: true, actorUserId: "admin1" });
    expect(userUpdate).toHaveBeenCalled();
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "user.name_changed_by_admin", actorUserId: "admin1" }));
  });
});

describe("herbeoordeling bank-inlog met ID-document", () => {
  const afgewezen = {
    status: "mismatch" as const,
    verifiedName: "P JANSEN",
    ibanLast4: "1234",
    bank: "ing",
    problems: ["name" as const],
    at: "2026-11-09T12:13:00+01:00",
    sessionId: "cs_test_1234567890",
  };

  it("keurt niet alsnog goed als de profielnaam is aangepast maar het ID-document een andere naam toont", async () => {
    kvGet.mockResolvedValueOnce({ ...afgewezen });
    userFindUnique.mockResolvedValueOnce({ fullName: "Piet Jansen" }); // naam later aangepast
    ivFindFirst.mockResolvedValueOnce({ rawPayload: { nameOnDocument: "Jan de Vries" } });
    const rec = await getBankLogin("u1");
    expect(rec?.status).toBe("mismatch");
    expect(kvSet).not.toHaveBeenCalled();
  });

  it("keurt wel goed als bank, profiel en document dezelfde persoon zijn", async () => {
    kvGet.mockResolvedValueOnce({ ...afgewezen, verifiedName: "J DE VRIES" });
    userFindUnique.mockResolvedValueOnce({ fullName: "Jan Vries" });
    ivFindFirst.mockResolvedValueOnce({ rawPayload: { nameOnDocument: "Jan de Vries" } });
    const rec = await getBankLogin("u1");
    expect(rec?.status).toBe("verified");
  });

  it("valt terug op de profielnaam zonder geverifieerd document", async () => {
    kvGet.mockResolvedValueOnce({ ...afgewezen, verifiedName: "J DE VRIES" });
    userFindUnique.mockResolvedValueOnce({ fullName: "Jan de Vries" });
    ivFindFirst.mockResolvedValueOnce(null);
    expect((await getBankLogin("u1"))?.status).toBe("verified");
  });
});
