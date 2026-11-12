import { beforeEach, describe, expect, it, vi } from "vitest";

// Uitbetalen via Stripe koppelen terwijl Stripe nieuwe accounts weigert (12 nov, foutenlogboek fout:655bd99e): "You
// cannot create new accounts because your account has been rejected." gaf een kale 500. Nu een 423 BETALEN_UIT, de vlag
// stripe:betalen-uit gezet, en in de werker-app een vertaalbare melding (sleutel stripe.tijdelijkUit).

const WEIGERING = "You cannot create new accounts because your account has been rejected.";
const m = vi.hoisted(() => ({ kv: new Map<string, unknown>(), create: vi.fn(), profiel: null as Record<string, unknown> | null }));

vi.mock("stripe", () => ({
  default: class {
    accounts = { create: (...a: unknown[]) => m.create(...a) };
  },
}));
vi.mock("@/lib/env", () => ({ env: { STRIPE_SECRET_KEY: "sk_test_x", APP_BASE_URL: "https://zekerflex.test" } }));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => m.kv.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void m.kv.set(k, v),
  kvDelete: async (k: string) => void m.kv.delete(k),
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/ops/alert", () => ({ alertOwnerLater: vi.fn() }));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requirePrincipal: async () => ({ userId: "u1", email: "w@zekerflex.test" }), requireRole: () => undefined }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    freelancerProfile: { findUnique: async () => m.profiel, update: vi.fn() },
    tenant: { findUnique: async () => null },
  },
}));

import { createExpressAccount } from "@/lib/billing/stripe";
import { maakAccountMetKvk } from "@/lib/billing/stripe-bedrijf";
import { isBetalenUitFout } from "@/lib/billing/stripe-betalen-stand";
import { BETALEN_UIT_KEY } from "@/lib/billing/stripe-betalen";
import { POST } from "@/app/api/me/payout/stripe-connect/route";
import { FOUTEN } from "@/lib/i18n/fouten";

beforeEach(() => {
  m.kv.clear();
  m.create.mockReset().mockRejectedValue(Object.assign(new Error(WEIGERING), { type: "StripeInvalidRequestError" }));
  m.profiel = { id: "f1", stripeConnectedAccountId: null, stripePayoutsEnabled: false };
});

describe("Stripe weigert nieuwe accounts", () => {
  it("de melding telt als 'betalen uit'", () => {
    expect(isBetalenUitFout(new Error(WEIGERING))).toBe(true);
    expect(isBetalenUitFout(new Error("Your card was declined."))).toBe(false);
  });

  it("createExpressAccount: 423 BETALEN_UIT en de vlag staat aan; daarna geen nieuwe poging bij Stripe", async () => {
    await expect(createExpressAccount({ email: "w@zekerflex.test" })).rejects.toMatchObject({ code: "BETALEN_UIT", status: 423 });
    expect(m.kv.has(BETALEN_UIT_KEY)).toBe(true);
    m.create.mockClear();
    await expect(createExpressAccount({ email: "w@zekerflex.test" })).rejects.toMatchObject({ code: "BETALEN_UIT", status: 423 });
    expect(m.create).not.toHaveBeenCalled();
  });

  it("maakAccountMetKvk (horeca, rijschool): ook 423 BETALEN_UIT in plaats van een upstream-fout", async () => {
    const stripe = { accounts: { create: (...a: unknown[]) => m.create(...a) } } as never;
    await expect(maakAccountMetKvk(stripe, { type: "express", country: "NL" }, "t1")).rejects.toMatchObject({ code: "BETALEN_UIT", status: 423 });
    expect(m.kv.has(BETALEN_UIT_KEY)).toBe(true);
  });

  it("een andere Stripe-fout blijft een gewone fout (geen vals 'betalen uit')", async () => {
    m.create.mockRejectedValue(new Error("Invalid email address"));
    await expect(createExpressAccount({ email: "x" })).rejects.toThrow("Invalid email address");
    expect(m.kv.has(BETALEN_UIT_KEY)).toBe(false);
  });
});

describe("de route voor de werker", () => {
  it("POST /api/me/payout/stripe-connect: 423 met code BETALEN_UIT en de vertaalbare sleutel, geen 500", async () => {
    const r = await POST();
    expect(r.status).toBe(423);
    const body = (await r.json()) as { error: { code: string; message: string; sleutel?: string } };
    expect(body.error.code).toBe("BETALEN_UIT");
    expect(body.error.sleutel).toBe("stripe.tijdelijkUit");
    expect(body.error.message).toBe(FOUTEN["stripe.tijdelijkUit"]!.nl);
  });

  it("staat de vlag al aan, dan wordt Stripe niet eens gevraagd", async () => {
    m.kv.set(BETALEN_UIT_KEY, { tot: new Date(Date.now() + 3_600_000).toISOString(), op: new Date().toISOString(), melding: "x" });
    const r = await POST();
    expect(r.status).toBe(423);
    expect(m.create).not.toHaveBeenCalled();
  });
});
