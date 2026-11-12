import { afterEach, describe, expect, it, vi } from "vitest";

// Beveiligingsronde 12 nov 2026 (86): openbare routes lezen een begrensde body, een limiet per IP staat vóór het lezen,
// en wat we loggen bevat geen tokens of e-mailadressen.

const h = vi.hoisted(() => ({
  fixedWindow: vi.fn(async () => ({ ok: true })),
  enforceRateLimit: vi.fn(async () => undefined),
  recordVisitEvent: vi.fn(async () => undefined),
  trackEvents: vi.fn(async () => ({ accepted: 1 })),
  schermContext: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/rate-limit", () => ({ fixedWindow: h.fixedWindow, enforceRateLimit: h.enforceRateLimit }));
vi.mock("@/lib/http/request", () => ({ clientIp: () => "203.0.113.9" }));
vi.mock("@/lib/logger", () => ({ logger: h.log }));
vi.mock("@/lib/auth", () => ({ getPrincipal: async () => null }));
vi.mock("@/lib/analytics/live", () => ({ recordVisitEvent: h.recordVisitEvent, sourceOf: () => "direct" }));
vi.mock("@/lib/analytics/track", () => ({ trackEvents: h.trackEvents }));
vi.mock("@/lib/ops/usage", () => ({ withUsage: (_n: string, f: (r: Request) => Promise<Response>) => f }));
vi.mock("@/lib/horeca/scherm-server", () => ({ schermContext: h.schermContext, voerUit: vi.fn() }));
vi.mock("@/lib/horeca/live", () => ({ schermDataVan: vi.fn(async () => ({})) }));
vi.mock("@/lib/rijschool/herkomst", () => ({ zelfdeHerkomst: () => true }));

import { POST as ping } from "@/app/api/analytics/ping/route";
import { POST as track } from "@/app/api/analytics/track/route";
import { POST as clientError } from "@/app/api/client-error/route";
import { POST as scherm } from "@/app/api/horeca/scherm/route";
import { ontvangerVoorLog } from "@/lib/mail";
import { emailHash } from "@/lib/auth/email-hash";

const groot = (n: number) => "x".repeat(n);
const post = (url: string, body: string, type = "application/json") => new Request(`http://localhost${url}`, { method: "POST", headers: { "content-type": type }, body });

afterEach(() => vi.clearAllMocks());

describe("analytics", () => {
  it("ping: een limiet per IP vóór het lezen; geweigerd = stil ok, zonder te tellen", async () => {
    h.fixedWindow.mockResolvedValueOnce({ ok: false });
    const res = await ping(post("/api/analytics/ping", JSON.stringify({ id: "abcdef12", e: "view", p: "/prijzen" }), "text/plain"));
    expect(res.status).toBe(200);
    expect(h.recordVisitEvent).not.toHaveBeenCalled();
    expect(String(h.fixedWindow.mock.calls[0]![0])).toContain("203.0.113.9");
  });

  it("ping: een te grote body wordt niet ingelezen (400, niets geteld)", async () => {
    const res = await ping(post("/api/analytics/ping", groot(20_000), "text/plain"));
    expect(res.status).toBe(400);
    expect(h.recordVisitEvent).not.toHaveBeenCalled();
  });

  it("track: limiet per IP vóór het lezen, en een te grote body geeft 400", async () => {
    h.fixedWindow.mockResolvedValueOnce({ ok: false });
    expect(await (await track(post("/api/analytics/track", "{}"))).json()).toEqual({ ok: true, accepted: 0 });
    expect((await track(post("/api/analytics/track", groot(100_000)))).status).toBe(400);
    expect(h.trackEvents).not.toHaveBeenCalled();
  });
});

describe("client-error", () => {
  it("logt geen tokens: query, fragment en lange id's gaan eruit", async () => {
    const token = "aB3dE6gH9jK2mN5pQ8sT1vW4yZ7cF0hJ9kL2";
    await clientError(post("/api/client-error", JSON.stringify({ message: "kapot", url: `https://zekerflex.com/review/${token}?code=geheim#qr-code`, stack: `at /betaal/${token}` })));
    const log = JSON.stringify(h.log.error.mock.calls);
    expect(log).toContain("client error boundary");
    expect(log).not.toContain(token);
    expect(log).not.toContain("geheim");
    expect(log).not.toContain("qr-code");
  });

  it("een te grote melding wordt niet gelezen en niet gelogd", async () => {
    const res = await clientError(post("/api/client-error", JSON.stringify({ message: groot(40_000) })));
    expect(res.status).toBe(200);
    expect(h.log.error).not.toHaveBeenCalled();
    expect(h.log.warn).not.toHaveBeenCalled();
  });
});

describe("horeca-scherm", () => {
  it("limiet per IP vóór het lezen, en een te grote body geeft 422 vóór de zaak wordt opgezocht", async () => {
    const res = await scherm(post("/api/horeca/scherm", JSON.stringify({ rol: "keuken", x: groot(100_000) })));
    expect(res.status).toBe(422);
    expect(h.enforceRateLimit).toHaveBeenCalledWith(expect.objectContaining({ name: "horeca-scherm", identifier: "203.0.113.9" }));
    expect(h.schermContext).not.toHaveBeenCalled();
  });
});

describe("logregels zonder e-mailadres", () => {
  it("mail: alleen het domein van de ontvanger", () => {
    expect(ontvangerVoorLog("jan.jansen@voorbeeld.nl")).toBe("…@voorbeeld.nl");
    expect(ontvangerVoorLog(["a@b.nl", "Piet <piet@Zaak.NL>"])).toBe("…@b.nl, …@zaak.nl");
    expect(ontvangerVoorLog(undefined)).toBe("…");
  });

  it("inloggen: 8 tekens hash, hetzelfde voor hetzelfde adres, nooit het adres zelf", () => {
    expect(emailHash("Jan@Voorbeeld.nl ")).toMatch(/^[0-9a-f]{8}$/);
    expect(emailHash("jan@voorbeeld.nl")).toBe(emailHash(" JAN@voorbeeld.nl"));
    expect(emailHash("jan@voorbeeld.nl")).not.toContain("jan");
  });
});
