import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/env", () => ({ env: { STRIPE_SECRET_KEY: "sk_test", APP_BASE_URL: "https://www.zekerflex.com" } }));
vi.mock("@/lib/billing/stripe", () => ({ getStripeClient: vi.fn() }));
vi.mock("@/lib/fiscal/store", () => ({ getFiscal: vi.fn(), setFiscal: vi.fn() }));
vi.mock("@/lib/storage/kv", () => ({ kvGet: vi.fn(), kvSet: vi.fn(), kvDelete: vi.fn() }));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn() }));

const { namesMatch, syncBankLogin } = await import("@/lib/kyc/bank-login");
const { getStripeClient } = await import("@/lib/billing/stripe");
const { kvGet } = await import("@/lib/storage/kv");
const { recordAudit } = await import("@/lib/audit");

describe("bank-login name match", () => {
  it("accepts the full name in bank capitals", () => {
    expect(namesMatch("Jan de Vries", "JAN DE VRIES")).toBe(true);
  });
  it("accepts initials with the same surname", () => {
    expect(namesMatch("Jan de Vries", "J. DE VRIES")).toBe(true);
    expect(namesMatch("Ioana Popescu", "HR/MW I POPESCU")).toBe(true);
  });
  it("ignores diacritics", () => {
    expect(namesMatch("Zoë Müller", "ZOE MULLER")).toBe(true);
  });
  it("rejects someone else's account", () => {
    expect(namesMatch("Jan de Vries", "P. JANSEN")).toBe(false);
  });
});

describe("bank-login sync", () => {
  const sessionId = "cs_test_a1b2c3d4e5f6g7h8";
  const rec = {
    status: "verified" as const,
    verifiedName: "JAN DE VRIES",
    ibanLast4: "4300",
    bank: "ing",
    problems: [],
    at: "2026-11-09T12:13:14.000Z",
    sessionId,
  };

  it("returns what is already recorded for the same session, without asking Stripe or auditing again", async () => {
    vi.mocked(kvGet).mockResolvedValueOnce(rec);
    const out = await syncBankLogin("user-1", sessionId);
    expect(out).toEqual(rec);
    expect(getStripeClient).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("ignores anything that is not a checkout session id", async () => {
    expect(await syncBankLogin("user-1", "pi_123")).toBeNull();
    expect(getStripeClient).not.toHaveBeenCalled();
  });
});
