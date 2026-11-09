import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const m = vi.hoisted(() => ({
  principal: vi.fn(),
  claim: vi.fn(),
  setSpeed: vi.fn(),
  accepted: vi.fn(),
  accept: vi.fn(),
  canBank: vi.fn(),
  payBank: vi.fn(),
  requestAdvance: vi.fn(),
  overview: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requirePrincipal: (...a: unknown[]) => m.principal(...a) }));
vi.mock("@/lib/redis", () => ({ claimIdempotency: (...a: unknown[]) => m.claim(...a) }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: async () => ({ fullName: "Liam" }) } } }));
vi.mock("@/lib/http/request", () => ({ clientIp: () => "203.0.113.9" }));
vi.mock("@/lib/dashboard/freelancer", () => ({ getFreelancerOverview: (...a: unknown[]) => m.overview(...a) }));
vi.mock("@/lib/payouts/preferences", () => ({
  PAYOUT_SPEEDS: {},
  payoutFee: (c: number, s: string) => Math.round(c * (s === "instant" ? 0.04 : s === "threeDay" ? 0.02 : 0)),
  getPayoutPrefs: async () => ({ speed: "standard", updatedAt: "2026-11-09T10:00:00+01:00" }),
  setPayoutSpeed: (...a: unknown[]) => m.setSpeed(...a),
}));
vi.mock("@/lib/payouts/advances", () => ({
  advanceFee: (c: number) => Math.round(c * 0.03),
  listAdvances: async () => [],
  maxAdvanceCents: (pending: number, out: number) => Math.max(0, Math.round(pending * 0.8) - out),
  outstandingAdvanceCents: async () => 1_000,
  requestAdvance: (...a: unknown[]) => m.requestAdvance(...a),
}));
vi.mock("@/lib/payouts/fastpay", () => ({
  FACTORING_TERMS_VERSION: "v1",
  acceptTerms: (...a: unknown[]) => m.accept(...a),
  hasAcceptedTerms: (...a: unknown[]) => m.accepted(...a),
}));
vi.mock("@/lib/bank/advance", () => ({
  canAdvanceToBank: (...a: unknown[]) => m.canBank(...a),
  payAdvanceToBank: (...a: unknown[]) => m.payBank(...a),
}));

import { GET, POST, PUT } from "@/app/api/me/payout/route";

const json = (body: unknown) =>
  new Request("http://localhost/api/me/payout", { method: "POST", headers: { "content-type": "application/json", "user-agent": "vitest" }, body: JSON.stringify(body) });
const kapot = () => new Request("http://localhost/api/me/payout", { method: "POST", body: "{niet json" });

afterEach(() => {
  vi.clearAllMocks();
});

function ingelogd() {
  m.principal.mockResolvedValue({ userId: "u1", email: "w@zekerflex.test" });
  m.overview.mockResolvedValue({ kpis: { pendingPayoutCents: 20_000 } });
}

describe("GET /api/me/payout", () => {
  it("401 als je niet ingelogd bent", async () => {
    m.principal.mockRejectedValue(AppError.unauthenticated());
    expect((await GET()).status).toBe(401);
  });

  it("geeft keuze, voorbeeldkosten en voorschotruimte (max = 80% van openstaand min lopende voorschotten)", async () => {
    ingelogd();
    m.canBank.mockResolvedValue(false);
    m.accepted.mockResolvedValue(true);
    const res = await GET();
    expect(res.status).toBe(200);
    const b = await res.json();
    expect(b.pendingPayoutCents).toBe(20_000);
    expect(b.exampleFees).toEqual({ instant: 800, threeDay: 400, standard: 0 });
    expect(b.outstandingAdvanceCents).toBe(1_000);
    expect(b.maxAdvanceCents).toBe(15_000);
    expect(b.advanceFeeRatePct).toBe(3);
    expect(b.advanceToBank).toBe(false);
    expect(b.factoringTerms).toEqual({ version: "v1", accepted: true });
  });
});

describe("PUT /api/me/payout", () => {
  it("401 als je niet ingelogd bent", async () => {
    m.principal.mockRejectedValue(AppError.unauthenticated());
    expect((await PUT(json({ speed: "standard" }))).status).toBe(401);
  });

  it("422 bij een onbekende snelheid", async () => {
    ingelogd();
    const res = await PUT(json({ speed: "turbo" }));
    expect(res.status).toBe(422);
    expect(m.setSpeed).not.toHaveBeenCalled();
  });

  it("422 met Nederlandse tekst bij een kapotte body", async () => {
    ingelogd();
    const res = await PUT(kapot());
    expect(res.status).toBe(422);
    expect((await res.json()).error.message).toMatch(/Vernieuw de pagina/);
  });

  it("standaard vraagt geen voorwaarden", async () => {
    ingelogd();
    m.setSpeed.mockResolvedValue({ speed: "standard" });
    const res = await PUT(json({ speed: "standard" }));
    expect(res.status).toBe(200);
    expect(m.accepted).not.toHaveBeenCalled();
    expect(m.setSpeed).toHaveBeenCalledWith("u1", "standard");
  });

  it("snel zonder eerder akkoord en zonder acceptTerms: 412 en niets opgeslagen", async () => {
    ingelogd();
    m.accepted.mockResolvedValue(false);
    const res = await PUT(json({ speed: "instant" }));
    expect(res.status).toBe(412);
    expect(m.setSpeed).not.toHaveBeenCalled();
  });

  it("snel met acceptTerms: legt het akkoord vast (IP en user-agent) en slaat de keuze op", async () => {
    ingelogd();
    m.setSpeed.mockResolvedValue({ speed: "instant" });
    const res = await PUT(json({ speed: "instant", acceptTerms: true }));
    expect(res.status).toBe(200);
    expect(m.accept).toHaveBeenCalledWith("u1", "203.0.113.9", "vitest");
    expect(m.setSpeed).toHaveBeenCalledWith("u1", "instant");
  });

  it("snel met eerder gegeven akkoord: werkt zonder opnieuw te accepteren", async () => {
    ingelogd();
    m.accepted.mockResolvedValue(true);
    m.setSpeed.mockResolvedValue({ speed: "threeDay" });
    const res = await PUT(json({ speed: "threeDay" }));
    expect(res.status).toBe(200);
    expect(m.accept).not.toHaveBeenCalled();
  });
});

describe("POST /api/me/payout (voorschot)", () => {
  it("401 als je niet ingelogd bent", async () => {
    m.principal.mockRejectedValue(AppError.unauthenticated());
    expect((await POST(json({ amountCents: 1000 }))).status).toBe(401);
  });

  it.each([[{ amountCents: -5 }], [{ amountCents: 0 }], [{ amountCents: 12.5 }], [{ amountCents: "100" }], [{}]])("422 bij ongeldig bedrag %j, zonder claim of aanvraag", async (body) => {
    ingelogd();
    const res = await POST(json(body));
    expect(res.status).toBe(422);
    expect(m.claim).not.toHaveBeenCalled();
    expect(m.requestAdvance).not.toHaveBeenCalled();
  });

  it("409 als er al een aanvraag in verwerking is", async () => {
    ingelogd();
    m.claim.mockResolvedValue(false);
    const res = await POST(json({ amountCents: 2000 }));
    expect(res.status).toBe(409);
    expect(m.claim).toHaveBeenCalledWith("advance-request:u1", 5);
    expect(m.requestAdvance).not.toHaveBeenCalled();
  });

  it("412 als het voorschot niet via ZekerFlex Bank kan", async () => {
    ingelogd();
    m.claim.mockResolvedValue(true);
    m.canBank.mockResolvedValue(false);
    const res = await POST(json({ amountCents: 2000 }));
    expect(res.status).toBe(412);
    expect(m.requestAdvance).not.toHaveBeenCalled();
  });

  it("geldig pad: vraagt aan met het openstaande bedrag, betaalt naar de bank, 201", async () => {
    ingelogd();
    m.claim.mockResolvedValue(true);
    m.canBank.mockResolvedValue(true);
    m.requestAdvance.mockResolvedValue({ id: "a1", amountCents: 2000, status: "requested" });
    const res = await POST(json({ amountCents: 2000 }));
    expect(res.status).toBe(201);
    expect(m.requestAdvance).toHaveBeenCalledWith("u1", 2000, 20_000);
    expect(m.payBank).toHaveBeenCalledWith(expect.objectContaining({ id: "a1" }), "Liam");
    expect(await res.json()).toEqual({ advance: { id: "a1", amountCents: 2000, status: "approved" }, paidToBank: true });
  });

  it("een afwijzing door requestAdvance (minimum, plafond) komt als 422 met de tekst terug", async () => {
    ingelogd();
    m.claim.mockResolvedValue(true);
    m.canBank.mockResolvedValue(true);
    m.requestAdvance.mockRejectedValue(new Error("Minimaal € 5,00"));
    const res = await POST(json({ amountCents: 100 }));
    expect(res.status).toBe(422);
    expect((await res.json()).error.message).toBe("Minimaal € 5,00");
    expect(m.payBank).not.toHaveBeenCalled();
  });
});
