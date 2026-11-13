import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Captcha (Turnstile/hCaptcha): "de dienst zegt nee" blijft geweigerd; "de dienst is onbereikbaar" (netwerk, time-out,
// 5xx) laat aanmelden door, onder een strengere limiet per IP, met een logregel met alleen host en soort.

const h = vi.hoisted(() => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  fixedWindow: vi.fn(async (..._a: unknown[]) => ({ ok: true })),
}));
vi.mock("@/lib/logger", () => ({ logger: h.log }));
vi.mock("@/lib/rate-limit", () => ({
  fixedWindow: h.fixedWindow,
  privateRateLimitIdentifier: (s: string) => `hmac-${s.length}`,
}));
vi.mock("@/lib/env", () => ({ env: { AUTH_SECRET: "test-secret-at-least-32-chars-long!!", CAPTCHA_PROVIDER: "turnstile" as string | undefined, CAPTCHA_SECRET: "geheim-van-de-site", CAPTCHA_SITE_KEY: undefined, CAPTCHA_POW_BITS: "8" } }));

import { env } from "@/lib/env";
import { verifyCaptcha } from "@/lib/security/captcha";

const IP = "203.0.113.77";
const antwoord = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  (env as { CAPTCHA_PROVIDER?: string | undefined }).CAPTCHA_PROVIDER = "turnstile";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  h.fixedWindow.mockResolvedValue({ ok: true });
});

describe("captcha bij een externe aanbieder", () => {
  it("een geldig token gaat door, zonder iets te loggen of te tellen", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => antwoord(200, { success: true })));
    expect(await verifyCaptcha("goed-token", IP)).toBe(true);
    expect(h.log.warn).not.toHaveBeenCalled();
    expect(h.fixedWindow).not.toHaveBeenCalled();
  });

  it("een ongeldig of verlopen token blijft geweigerd (de aanbieder antwoordt wel)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => antwoord(200, { success: false, "error-codes": ["timeout-or-duplicate"] })));
    expect(await verifyCaptcha("slecht-token", IP)).toBe(false);
    expect(h.fixedWindow).not.toHaveBeenCalled();
  });

  it("een 4xx van de aanbieder is geen uitval: geweigerd", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => antwoord(400, { success: false })));
    expect(await verifyCaptcha("x", IP)).toBe(false);
  });

  it("geen token blijft geweigerd, zonder de aanbieder te bellen", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await verifyCaptcha(undefined, IP)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("een time-out laat door, met een strengere limiet per IP en een logregel met alleen host en soort", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new DOMException("De bewerking is verlopen", "TimeoutError"); }));
    expect(await verifyCaptcha("token-dat-niet-in-het-log-mag-staan", IP)).toBe(true);
    expect(h.fixedWindow).toHaveBeenCalledTimes(1);
    const [sleutel, limiet, venster] = h.fixedWindow.mock.calls[0] as [string, number, number];
    expect(sleutel).toContain("captcha-onbereikbaar");
    expect(sleutel).not.toContain(IP);
    expect(limiet).toBe(3);
    expect(venster).toBe(3600);
    expect(h.log.warn).toHaveBeenCalledWith("captcha-onbereikbaar", { host: "challenges.cloudflare.com", soort: "time-out" });
    const log = JSON.stringify(h.log.warn.mock.calls);
    expect(log).not.toContain(IP);
    expect(log).not.toContain("token-dat-niet");
    expect(log).not.toContain("geheim-van-de-site");
  });

  it("een netwerkfout laat door (soort netwerk)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    expect(await verifyCaptcha("x", IP)).toBe(true);
    expect(h.log.warn).toHaveBeenCalledWith("captcha-onbereikbaar", { host: "challenges.cloudflare.com", soort: "netwerk" });
  });

  it("een 503 laat door (soort 5xx), ook bij hCaptcha met de goede host", async () => {
    (env as { CAPTCHA_PROVIDER?: string | undefined }).CAPTCHA_PROVIDER = "hcaptcha";
    vi.stubGlobal("fetch", vi.fn(async () => antwoord(503, {})));
    expect(await verifyCaptcha("x", IP)).toBe(true);
    expect(h.log.warn).toHaveBeenCalledWith("captcha-onbereikbaar", { host: "api.hcaptcha.com", soort: "5xx" });
  });

  it("bij onbereikbaar wordt het IP na de limiet geweigerd", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => antwoord(502, {})));
    h.fixedWindow.mockResolvedValue({ ok: false });
    expect(await verifyCaptcha("x", IP)).toBe(false);
  });

  it("een storing in de limiet laat door (fail-open)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => antwoord(500, {})));
    h.fixedWindow.mockRejectedValueOnce(new Error("redis weg"));
    expect(await verifyCaptcha("x", IP)).toBe(true);
  });

  it("zonder bekend IP laat hij door zonder één gedeelde emmer te vullen", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => antwoord(500, {})));
    expect(await verifyCaptcha("x", undefined)).toBe(true);
    expect(h.fixedWindow).not.toHaveBeenCalled();
  });

  it("de aanroep gebruikt een time-out van ongeveer 4 seconden", async () => {
    const spy = vi.spyOn(AbortSignal, "timeout");
    vi.stubGlobal("fetch", vi.fn(async () => antwoord(200, { success: true })));
    await verifyCaptcha("x", IP);
    expect(spy).toHaveBeenCalledWith(4000);
    spy.mockRestore();
  });
});
