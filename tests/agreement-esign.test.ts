import { afterEach, describe, expect, it, vi } from "vitest";

const kv: Record<string, unknown> = {};
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => kv[k] ?? null,
  kvSet: async (k: string, v: unknown) => void (kv[k] = v),
}));
vi.mock("@/lib/env", () => ({ env: { AUTH_SECRET: "test-secret-at-least-32-chars-long!!", TSA_URL: undefined, TSA_TOKEN: undefined } }));
const findUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { modelAgreement: { findUnique: (...a: unknown[]) => findUnique(...a) } } }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { getAgreementSeal, sealAgreement, verifyAgreementSeal } from "@/lib/agreements/esign";

const base = {
  reference: "ZF-MOD-2026-000123",
  templateKey: "standaard",
  templateVersion: "1.0",
  freelancerLegalName: "Jan de Vries",
  freelancerKvkNumber: "12345678",
  tenantId: "t1",
  hourlyRateCents: 2500,
  freelancerSignedAt: new Date("2026-10-20T10:00:00Z"),
  clientSignedAt: new Date("2026-10-20T11:00:00Z"),
  status: "ACTIVE",
  freelancer: { user: { fullName: "Jan de Vries" } },
  tenant: { name: "Bakkerij Bol" },
};

afterEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(kv)) delete kv[k];
});

describe("sealAgreement", () => {
  it("seals an active, fully-signed agreement with an internal trusted timestamp", async () => {
    findUnique.mockResolvedValue(base);
    const seal = await sealAgreement("a1");
    expect(seal).not.toBeNull();
    expect(seal!.contentHash).toHaveLength(64);
    expect(seal!.signers.map((s) => s.party)).toEqual(["FREELANCER", "CLIENT"]);
    expect(seal!.timestamp.qualified).toBe(false); // no TSA configured
    expect(seal!.timestamp.authority).toMatch(/intern/i);
    const v = await verifyAgreementSeal("a1");
    expect(v).toMatchObject({ sealed: true, valid: true });
  });

  it("is idempotent — same content returns the same seal", async () => {
    findUnique.mockResolvedValue(base);
    const first = await sealAgreement("a1");
    const second = await sealAgreement("a1");
    expect(second!.sealedAt).toBe(first!.sealedAt);
    expect(second!.hash).toBe(first!.hash);
  });

  it("detects tampering — a changed rate breaks verification", async () => {
    findUnique.mockResolvedValue(base);
    await sealAgreement("a1");
    findUnique.mockResolvedValue({ ...base, hourlyRateCents: 9900 }); // content changed after sealing
    const v = await verifyAgreementSeal("a1");
    expect(v.valid).toBe(false);
    expect(v.reason).toMatch(/gewijzigd/i);
  });

  it("does not seal an agreement that isn't fully signed", async () => {
    findUnique.mockResolvedValue({ ...base, clientSignedAt: null });
    expect(await sealAgreement("a1")).toBeNull();
    expect(await getAgreementSeal("a1")).toBeNull();
  });
});
