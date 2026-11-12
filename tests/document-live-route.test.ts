import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

// POST /api/onboarding/document-live: alleen een ingelogde werker, met een limiet, geen 403; terug alleen ja/nee en
// een getal, nooit de inhoud van de code (die bevat het BSN), en het beeld komt in geen log.

const requirePrincipal = vi.fn();
const hasRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requirePrincipal: (...a: unknown[]) => requirePrincipal(...a),
  hasRole: (...a: unknown[]) => hasRole(...a),
}));
const enforceRateLimit = vi.fn();
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: (...a: unknown[]) => enforceRateLimit(...a) }));
const meetDocumentLive = vi.fn();
vi.mock("@/lib/kyc/document-live", () => ({ meetDocumentLive: (...a: unknown[]) => meetDocumentLive(...a) }));
const logError = vi.fn();
vi.mock("@/lib/logger", () => ({ logger: { error: (...a: unknown[]) => logError(...a), warn: vi.fn(), info: vi.fn() } }));

import { POST } from "@/app/api/onboarding/document-live/route";

const BEELD = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const verzoek = (zoek = "?mrz=1", body: Uint8Array<ArrayBuffer> = BEELD, type = "image/jpeg") =>
  new Request(`http://localhost/api/onboarding/document-live${zoek}`, { method: "POST", headers: { "Content-Type": type }, body });

const werker = () => {
  requirePrincipal.mockResolvedValue({ userId: "u1" });
  hasRole.mockReturnValue(true);
};

afterEach(() => vi.resetAllMocks());

describe("POST /api/onboarding/document-live", () => {
  it("zonder login: 401, er wordt niets gemeten", async () => {
    requirePrincipal.mockRejectedValue(AppError.unauthenticated());
    expect((await POST(verzoek())).status).toBe(401);
    expect(meetDocumentLive).not.toHaveBeenCalled();
  });

  it("geen werkersaccount: 423 (geen 403, want CrowdSec telt die)", async () => {
    requirePrincipal.mockResolvedValue({ userId: "u1" });
    hasRole.mockReturnValue(false);
    const res = await POST(verzoek());
    expect(res.status).toBe(423);
    expect((await res.json()).error.code).toBe("ALLEEN_WERKER");
    expect(meetDocumentLive).not.toHaveBeenCalled();
  });

  it("een werker krijgt alleen ja/nee en een getal terug, met een limiet en zonder cache", async () => {
    werker();
    meetDocumentLive.mockResolvedValue({ leesbaar: true, portret: 0.14 });
    const res = await POST(verzoek("?mrz=1&portret=1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ meting: { leesbaar: true, portret: 0.14 } });
    expect(meetDocumentLive.mock.calls[0]![1]).toEqual({ mrz: true, portret: true });
    expect(Array.from(meetDocumentLive.mock.calls[0]![0] as Uint8Array)).toEqual(Array.from(BEELD));
    expect(enforceRateLimit).toHaveBeenCalledWith(expect.objectContaining({ name: "document-live", identifier: "u1" }));
  });

  it("zonder wat er gemeten moet worden, een verkeerd bestand of een te groot beeld: 422 zonder te meten", async () => {
    werker();
    expect((await POST(verzoek(""))).status).toBe(422);
    expect((await POST(verzoek("?mrz=1", BEELD, "application/pdf"))).status).toBe(422);
    expect((await POST(verzoek("?mrz=1", new Uint8Array(1_600_000)))).status).toBe(422);
    expect((await POST(verzoek("?mrz=1", new Uint8Array(0)))).status).toBe(422);
    expect(meetDocumentLive).not.toHaveBeenCalled();
  });

  it("te vaak: 429 komt door", async () => {
    werker();
    enforceRateLimit.mockRejectedValue(AppError.rateLimited("te vaak", 60, 300));
    expect((await POST(verzoek())).status).toBe(429);
    expect(meetDocumentLive).not.toHaveBeenCalled();
  });

  it("een storing logt alleen de soort fout, nooit het beeld of de gelezen code", async () => {
    werker();
    meetDocumentLive.mockRejectedValue(new Error("P<NLDJANSEN<<JAN 123456782"));
    const res = await POST(verzoek());
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("JANSEN");
    const gelogd = JSON.stringify(logError.mock.calls);
    expect(gelogd).not.toContain("JANSEN");
    expect(gelogd).not.toContain("123456782");
    expect(gelogd).not.toMatch(/255,216|ffd8/);
  });
});
