import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

// POST /api/onboarding/gezicht-live: alleen een ingelogde werker, met een limiet, geen 403, en het beeld komt
// nergens anders terecht dan in de meting (niet in een log, niet in het antwoord).

const requirePrincipal = vi.fn();
const hasRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requirePrincipal: (...a: unknown[]) => requirePrincipal(...a),
  hasRole: (...a: unknown[]) => hasRole(...a),
}));
const enforceRateLimit = vi.fn();
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: (...a: unknown[]) => enforceRateLimit(...a) }));
const meetLive = vi.fn();
vi.mock("@/lib/kyc/gezicht/live", () => ({ meetLive: (...a: unknown[]) => meetLive(...a) }));
const logError = vi.fn();
vi.mock("@/lib/logger", () => ({ logger: { error: (...a: unknown[]) => logError(...a), warn: vi.fn(), info: vi.fn() } }));

import { POST } from "@/app/api/onboarding/gezicht-live/route";

const BEELD = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const verzoek = (body: Uint8Array = BEELD, type = "image/jpeg", extra: Record<string, string> = {}) =>
  new Request("http://localhost/api/onboarding/gezicht-live", { method: "POST", headers: { "Content-Type": type, ...extra }, body });

afterEach(() => vi.resetAllMocks());

describe("POST /api/onboarding/gezicht-live", () => {
  it("zonder login: 401, er wordt niets gemeten", async () => {
    requirePrincipal.mockRejectedValue(AppError.unauthenticated());
    const res = await POST(verzoek());
    expect(res.status).toBe(401);
    expect(meetLive).not.toHaveBeenCalled();
  });

  it("geen werkersaccount: 423 (geen 403, want CrowdSec telt die), er wordt niets gemeten", async () => {
    requirePrincipal.mockResolvedValue({ userId: "u1" });
    hasRole.mockReturnValue(false);
    const res = await POST(verzoek());
    expect(res.status).toBe(423);
    expect((await res.json()).error.code).toBe("ALLEEN_WERKER");
    expect(meetLive).not.toHaveBeenCalled();
  });

  it("een werker krijgt alleen getallen terug, met een limiet per gebruiker en zonder cache", async () => {
    requirePrincipal.mockResolvedValue({ userId: "u1" });
    hasRole.mockReturnValue(true);
    const meting = { draaiing: 0.02, oog: 0.19, breedteDeel: 0.4, score: 0.93, meerdere: false };
    meetLive.mockResolvedValue(meting);
    const res = await POST(verzoek());
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ meting });
    expect(enforceRateLimit).toHaveBeenCalledWith(expect.objectContaining({ name: "gezicht-live", identifier: "u1" }));
    expect(Array.from(meetLive.mock.calls[0]![0] as Uint8Array)).toEqual(Array.from(BEELD));
  });

  it("geen gezicht in beeld: meting null", async () => {
    requirePrincipal.mockResolvedValue({ userId: "u1" });
    hasRole.mockReturnValue(true);
    meetLive.mockResolvedValue(null);
    const res = await POST(verzoek());
    expect(await res.json()).toEqual({ meting: null });
  });

  it("een verkeerd soort bestand of een te groot beeld wordt geweigerd zonder te meten", async () => {
    requirePrincipal.mockResolvedValue({ userId: "u1" });
    hasRole.mockReturnValue(true);
    expect((await POST(verzoek(BEELD, "application/pdf"))).status).toBe(422);
    expect((await POST(verzoek(new Uint8Array(700_000)))).status).toBe(422);
    expect((await POST(verzoek(new Uint8Array(0)))).status).toBe(422);
    expect(meetLive).not.toHaveBeenCalled();
  });

  it("te vaak: de foutmelding van de limiet (429) komt door", async () => {
    requirePrincipal.mockResolvedValue({ userId: "u1" });
    hasRole.mockReturnValue(true);
    enforceRateLimit.mockRejectedValue(AppError.rateLimited("te vaak", 60, 400));
    const res = await POST(verzoek());
    expect(res.status).toBe(429);
    expect(meetLive).not.toHaveBeenCalled();
  });

  it("een storing logt alleen de foutmelding, nooit het beeld", async () => {
    requirePrincipal.mockResolvedValue({ userId: "u1" });
    hasRole.mockReturnValue(true);
    meetLive.mockRejectedValue(new Error("model weg"));
    const res = await POST(verzoek());
    expect(res.status).toBe(500);
    expect(logError).toHaveBeenCalledTimes(1);
    const gelogd = JSON.stringify(logError.mock.calls[0]);
    expect(gelogd).toContain("model weg");
    expect(gelogd).not.toMatch(/255,216|ffd8/);
  });
});
