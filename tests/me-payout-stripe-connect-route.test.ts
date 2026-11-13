import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const m = vi.hoisted(() => ({
  principal: vi.fn(),
  hasRole: true,
  profile: null as Record<string, unknown> | null,
  update: vi.fn(),
  status: vi.fn(),
  login: vi.fn(),
  create: vi.fn(),
  onboard: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requirePrincipal: (...a: unknown[]) => m.principal(...a),
  requireRole: (_p: unknown, ...roles: string[]) => {
    if (!m.hasRole) throw AppError.forbidden(`nodig: ${roles.join(", ")}`);
  },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    freelancerProfile: {
      findUnique: async () => m.profile,
      update: (...a: unknown[]) => m.update(...a),
    },
  },
}));
vi.mock("@/lib/env", () => ({ env: { APP_BASE_URL: "https://zekerflex.test/" } }));
vi.mock("@/lib/billing/stripe", () => ({
  getConnectAccountStatus: (...a: unknown[]) => m.status(...a),
  createAccountLoginLink: (...a: unknown[]) => m.login(...a),
  createExpressAccount: (...a: unknown[]) => m.create(...a),
  createAccountOnboardingLink: (...a: unknown[]) => m.onboard(...a),
}));
vi.mock("@/lib/audit", () => ({ recordAudit: (...a: unknown[]) => m.audit(...a) }));

import { GET, POST } from "@/app/api/me/payout/stripe-connect/route";

const P = { userId: "u1", email: "w@zekerflex.test" };

afterEach(() => {
  vi.clearAllMocks();
  m.hasRole = true;
  m.profile = null;
});

function ingelogd() {
  m.principal.mockResolvedValue(P);
}

describe("GET /api/me/payout/stripe-connect", () => {
  it("401 als je niet ingelogd bent", async () => {
    m.principal.mockRejectedValue(AppError.unauthenticated());
    const res = await GET();
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHENTICATED");
  });

  it("403 zonder freelancerprofiel", async () => {
    ingelogd();
    m.profile = null;
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("niet gekoppeld: geen Stripe-aanroep", async () => {
    ingelogd();
    m.profile = { id: "p1", stripeConnectedAccountId: null, stripePayoutsEnabled: false };
    const res = await GET();
    expect(await res.json()).toEqual({ connected: false, payoutsEnabled: false });
    expect(m.status).not.toHaveBeenCalled();
  });

  it("al ingeschakeld: antwoordt zonder Stripe te vragen", async () => {
    ingelogd();
    m.profile = { id: "p1", stripeConnectedAccountId: "acct_1", stripePayoutsEnabled: true };
    const res = await GET();
    expect(await res.json()).toEqual({ connected: true, payoutsEnabled: true });
    expect(m.status).not.toHaveBeenCalled();
  });

  it("gekoppeld maar nog niet ingeschakeld: haalt live status op en slaat een wijziging op", async () => {
    ingelogd();
    m.profile = { id: "p1", stripeConnectedAccountId: "acct_1", stripePayoutsEnabled: false };
    m.status.mockResolvedValue({ payoutsEnabled: true });
    const res = await GET();
    expect(await res.json()).toEqual({ connected: true, payoutsEnabled: true });
    expect(m.status).toHaveBeenCalledWith("acct_1");
    expect(m.update).toHaveBeenCalledWith({ where: { id: "p1" }, data: { stripePayoutsEnabled: true } });
  });

  it("gekoppeld, nog steeds niet klaar: schrijft niets weg", async () => {
    ingelogd();
    m.profile = { id: "p1", stripeConnectedAccountId: "acct_1", stripePayoutsEnabled: false };
    m.status.mockResolvedValue({ payoutsEnabled: false });
    const res = await GET();
    expect((await res.json()).payoutsEnabled).toBe(false);
    expect(m.update).not.toHaveBeenCalled();
  });
});

describe("POST /api/me/payout/stripe-connect", () => {
  it("401 als je niet ingelogd bent", async () => {
    m.principal.mockRejectedValue(AppError.unauthenticated());
    expect((await POST()).status).toBe(401);
  });

  it("403 voor een andere rol dan FREELANCER, zonder iets aan te maken", async () => {
    ingelogd();
    m.hasRole = false;
    const res = await POST();
    expect(res.status).toBe(403);
    expect(m.create).not.toHaveBeenCalled();
  });

  it("nieuw account: maakt het aan, slaat het op, legt het vast en geeft de onboarding-link", async () => {
    ingelogd();
    m.profile = { id: "p1", stripeConnectedAccountId: null, stripePayoutsEnabled: false };
    m.create.mockResolvedValue({ id: "acct_new" });
    m.onboard.mockResolvedValue({ url: "https://connect.stripe.test/onboard" });
    const res = await POST();
    expect(await res.json()).toEqual({ url: "https://connect.stripe.test/onboard" });
    expect(m.create).toHaveBeenCalledWith({ email: "w@zekerflex.test" });
    expect(m.update).toHaveBeenCalledWith({ where: { id: "p1" }, data: { stripeConnectedAccountId: "acct_new", stripePayoutsEnabled: false } });
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "freelancer.stripe_connect_started", actorUserId: "u1", targetId: "p1" }));
    // een slash achteraan APP_BASE_URL wordt weggehaald
    expect(m.onboard).toHaveBeenCalledWith("acct_new", {
      returnUrl: "https://zekerflex.test/dashboard/profiel?stripe=return",
      refreshUrl: "https://zekerflex.test/dashboard/profiel?stripe=refresh",
    });
  });

  it("bestaand maar onvolledig account: hervat de onboarding zonder nieuw account", async () => {
    ingelogd();
    m.profile = { id: "p1", stripeConnectedAccountId: "acct_1", stripePayoutsEnabled: false };
    m.onboard.mockResolvedValue({ url: "https://connect.stripe.test/resume" });
    const res = await POST();
    expect((await res.json()).url).toBe("https://connect.stripe.test/resume");
    expect(m.create).not.toHaveBeenCalled();
    expect(m.audit).not.toHaveBeenCalled();
  });

  it("uitbetalingen ingeschakeld: geeft een inloglink naar het Stripe-dashboard", async () => {
    ingelogd();
    m.profile = { id: "p1", stripeConnectedAccountId: "acct_1", stripePayoutsEnabled: true };
    m.login.mockResolvedValue("https://connect.stripe.test/login");
    const res = await POST();
    expect(await res.json()).toEqual({ url: "https://connect.stripe.test/login" });
    expect(m.onboard).not.toHaveBeenCalled();
  });
});
