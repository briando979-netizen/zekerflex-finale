import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/env", () => ({ env: { STRIPE_SECRET_KEY: "sk_test", APP_BASE_URL: "https://www.zekerflex.com" } }));
vi.mock("@/lib/billing/stripe", () => ({ getStripeClient: vi.fn() }));
vi.mock("@/lib/fiscal/store", () => ({ getFiscal: vi.fn(), setFiscal: vi.fn() }));
vi.mock("@/lib/storage/kv", () => ({ kvGet: vi.fn(), kvSet: vi.fn(), kvDelete: vi.fn() }));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn() }));

const { namesMatch } = await import("@/lib/kyc/bank-login");

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
