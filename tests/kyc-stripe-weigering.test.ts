import { afterEach, describe, expect, it, vi } from "vitest";

// Stripe weigert Identity voor het hele account (11 nov 2026: "This account is unable to perform this action",
// 3 keer in het foutenlogboek): 24 uur geen sync en geen knop, één waarschuwing, een taak voor de eigenaar.

const db = vi.hoisted(() => ({
  idv: [] as Record<string, unknown>[],
  retrieve: vi.fn(),
  create: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));
const kvStore = vi.hoisted(() => new Map<string, unknown>());

vi.mock("@/lib/env", () => ({ env: { STRIPE_SECRET_KEY: "sk_test_x", APP_BASE_URL: "https://zf.test" } }));
vi.mock("@/lib/logger", () => ({ logger: { warn: (...a: unknown[]) => db.warn(...a), error: (...a: unknown[]) => db.error(...a), info: vi.fn() } }));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => kvStore.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void kvStore.set(k, v),
}));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/billing/stripe", () => ({ getStripeClient: () => ({ identity: { verificationSessions: { retrieve: db.retrieve, create: db.create } } }) }));
vi.mock("@/lib/onboarding/verify", () => ({ nameSimilarity: () => 1 }));
vi.mock("@/lib/onboarding/id-geverifieerd", () => ({ meldIdGeverifieerd: vi.fn() }));
vi.mock("@/lib/ops/alert", () => ({ alertOwnerLater: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    identityVerification: {
      findFirst: async ({ where }: { where: { userId: string } }) => db.idv.find((r) => r.userId === where.userId) ?? null,
      create: vi.fn(),
      updateMany: async () => ({ count: 1 }),
    },
    user: { update: vi.fn() },
  },
}));

import { startStripeIdentity, stripeIdentityAvailable, syncStripeIdentity } from "@/lib/kyc/stripe-identity";
import { actieveWeigering, isAccountWeigering, WEIGERING_KEY } from "@/lib/kyc/stripe-weigering";

const WEIGERING = Object.assign(new Error("This account is unable to perform this action. If you require further assistance please contact us via https://support.stripe.com/contact."), { type: "StripeInvalidRequestError" });

afterEach(() => {
  kvStore.clear();
  db.idv = [];
  vi.clearAllMocks();
});

describe("isAccountWeigering", () => {
  it("herkent een weigering van het account, niet een gewone storing", () => {
    expect(isAccountWeigering(WEIGERING)).toBe(true);
    expect(isAccountWeigering({ type: "StripePermissionError", message: "x" })).toBe(true);
    expect(isAccountWeigering({ statusCode: 403, message: "x" })).toBe(true);
    expect(isAccountWeigering(new Error("connect ETIMEDOUT"))).toBe(false);
    expect(isAccountWeigering({ statusCode: 500, message: "An error occurred with our connection to Stripe" })).toBe(false);
    expect(isAccountWeigering(null)).toBe(false);
  });
});

describe("syncStripeIdentity bij een weigering van het account", () => {
  it("zet de sync en de knop 24 uur uit, met één waarschuwing; daarna wordt Stripe niet meer gevraagd", async () => {
    db.idv = [{ userId: "u1", sessionId: "vs_1", decisionStatus: "started" }];
    db.retrieve.mockRejectedValue(WEIGERING);
    await syncStripeIdentity("u1");
    expect(db.retrieve).toHaveBeenCalledTimes(1);
    expect(db.warn).toHaveBeenCalledTimes(1);
    expect(String(db.warn.mock.calls[0]?.[0])).toMatch(/24 uur uit/);
    const w = await actieveWeigering();
    expect(w?.melding).toMatch(/^This account is unable to perform this action/);
    expect(Date.parse(w!.tot) - Date.now()).toBeGreaterThan(23 * 3_600_000);
    // de knop "Snel via Stripe" verdwijnt
    expect(await stripeIdentityAvailable()).toBe(false);
    // volgende bezoeken: niets meer bij Stripe en niets meer in het logboek
    await syncStripeIdentity("u1");
    await syncStripeIdentity("u1");
    expect(db.retrieve).toHaveBeenCalledTimes(1);
    expect(db.warn).toHaveBeenCalledTimes(1);
  });

  it("na 24 uur probeert de sync het weer", async () => {
    db.idv = [{ userId: "u1", sessionId: "vs_1", decisionStatus: "started" }];
    kvStore.set(WEIGERING_KEY, { tot: new Date(Date.now() - 1000).toISOString(), op: new Date().toISOString(), melding: "x" });
    db.retrieve.mockResolvedValue({ id: "vs_1", status: "processing" });
    await syncStripeIdentity("u1");
    expect(db.retrieve).toHaveBeenCalledTimes(1);
  });

  it("een gewone storing blijft een gewone waarschuwing, zonder de sync uit te zetten", async () => {
    db.idv = [{ userId: "u1", sessionId: "vs_1", decisionStatus: "started" }];
    db.retrieve.mockRejectedValue(new Error("connect ETIMEDOUT"));
    await syncStripeIdentity("u1");
    expect(String(db.warn.mock.calls[0]?.[0])).toBe("stripe identity sync failed");
    expect(await actieveWeigering()).toBeNull();
  });

  it("ook het starten van een controle legt de weigering vast", async () => {
    db.create.mockRejectedValue(WEIGERING);
    await expect(startStripeIdentity("u1", "jan@jansen.nl")).rejects.toThrow(/Stripe/);
    expect(await actieveWeigering()).not.toBeNull();
    expect(db.error).not.toHaveBeenCalled();
    expect(db.warn).toHaveBeenCalledTimes(1);
  });
});
