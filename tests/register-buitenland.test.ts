import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  tenantCreate: vi.fn(),
  tenantFindFirst: vi.fn(),
  userCreate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: async () => null },
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({ tenant: { create: m.tenantCreate, findFirst: m.tenantFindFirst }, user: { create: m.userCreate } }),
  },
}));
vi.mock("@/lib/env", () => ({ env: {} }));
vi.mock("@/lib/audit", () => ({ recordAudit: async () => undefined }));
vi.mock("@/lib/fiscal/store", () => ({ setFiscal: async () => undefined }));
vi.mock("@/lib/analytics/funnel", () => ({ recordFunnel: async () => undefined }));

const { registerAccount, registerSchema } = await import("@/lib/auth/register");

const basis = {
  type: "bedrijf" as const,
  fullName: "Jan Jansen",
  email: "jan@muster.de",
  password: "een-sterk-wachtwoord-1",
  companyName: "Muster GmbH",
};

beforeEach(() => {
  vi.clearAllMocks();
  m.tenantCreate.mockResolvedValue({ id: "t1" });
  m.tenantFindFirst.mockResolvedValue(null);
  m.userCreate.mockResolvedValue({ id: "u1" });
});

describe("aanmelden als bedrijf buiten Nederland", () => {
  it("zonder land blijft het Nederland met het gekozen KVK-nummer, zoals voorheen", async () => {
    await registerAccount(registerSchema.parse({ ...basis, kvkNumber: "12345678" }));
    expect(m.tenantCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ country: "NL", kvkNumber: "12345678" }) }));
  });

  it("een Duits bedrijf krijgt land DE en geen KVK-nummer, ook als er toch een nummer meekomt", async () => {
    await registerAccount(registerSchema.parse({ ...basis, land: "DE", kvkNumber: "12345678" }));
    const data = m.tenantCreate.mock.calls[0]?.[0].data;
    expect(data.country).toBe("DE");
    expect(data).not.toHaveProperty("kvkNumber");
    expect(m.tenantFindFirst).not.toHaveBeenCalled();
  });

  it("neemt een land buiten de EU aan", async () => {
    await registerAccount(registerSchema.parse({ ...basis, land: "US" }));
    expect(m.tenantCreate.mock.calls[0]?.[0].data.country).toBe("US");
  });

  it("weigert een onbekend land", () => {
    expect(registerSchema.safeParse({ ...basis, land: "QQ" }).success).toBe(false);
  });

  it("een werker negeert het land", async () => {
    await registerAccount(registerSchema.parse({ ...basis, type: "freelancer", land: "DE" }));
    expect(m.tenantCreate).not.toHaveBeenCalled();
  });
});
