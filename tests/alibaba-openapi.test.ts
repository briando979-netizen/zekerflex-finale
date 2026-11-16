import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { autorisatieAdres, leesTokenAntwoord, tekenAlibaba, verzoekParams } from "@/lib/integrations/alibaba-openapi";

// De officiële Alibaba-koppeling (16 nov 2026, eigenaar stuurde de documentatie van /auth/token/create): ondertekenen,
// autoriseren, het token maken, versleuteld bewaren en vernieuwen.

const { kv } = vi.hoisted(() => ({ kv: new Map<string, unknown>() }));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => kv.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void kv.set(k, v),
  kvDelete: async (k: string) => void kv.delete(k),
}));
vi.mock("@/lib/env", () => ({
  env: {
    APP_BASE_URL: "https://zekerflex.example",
    AUTH_SECRET: "a".repeat(48),
    ALIBABA_APP_KEY: "500123",
    ALIBABA_APP_SECRET: "geheim",
    ALIBABA_API_URL: "https://gateway.example/rest/",
    ALIBABA_AUTH_URL: "https://auth.example/oauth/authorize",
  },
}));

const lees = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

describe("ondertekenen en autoriseren", () => {
  it("handtekening: API-pad + gesorteerde parameters (naam en waarde aan elkaar), HMAC-SHA256 met het secret, hoofdletters", () => {
    const params = { timestamp: "1", code: "C", app_key: "K", sign_method: "sha256" };
    const verwacht = createHmac("sha256", "S").update("/auth/token/createapp_keyKcodeCsign_methodsha256timestamp1").digest("hex").toUpperCase();
    expect(tekenAlibaba("/auth/token/create", params, "S")).toBe(verwacht);
    // een meegestuurde sign telt niet mee
    expect(tekenAlibaba("/auth/token/create", { ...params, sign: "X" }, "S")).toBe(verwacht);
  });

  it("de systeemparameters gaan mee, het access_token alleen als het er is", () => {
    const p = verzoekParams("/x", { a: "1" }, { appKey: "K", secret: "S", nu: 5 });
    expect(p).toMatchObject({ a: "1", app_key: "K", timestamp: "5", sign_method: "sha256" });
    expect(p.access_token).toBeUndefined();
    expect(p.sign).toMatch(/^[0-9A-F]{64}$/);
    expect(verzoekParams("/x", {}, { appKey: "K", secret: "S", accessToken: "T", nu: 5 }).access_token).toBe("T");
  });

  it("de autorisatiepagina krijgt response_type, client_id, redirect_uri en state", () => {
    const u = new URL(autorisatieAdres("https://auth.example/oauth/authorize", "500123", "https://zekerflex.example/api/admin/alibaba/terug", "st"));
    expect(Object.fromEntries(u.searchParams)).toEqual({ response_type: "code", force_auth: "true", redirect_uri: "https://zekerflex.example/api/admin/alibaba/terug", client_id: "500123", state: "st" });
  });

  it("het tokenantwoord soepel gelezen: bovenaan of in een omhulsel, een fout met de melding, refresh 0 = niet te vernieuwen", () => {
    const nu = Date.parse("2026-11-16T00:00:00Z");
    expect(leesTokenAntwoord({ code: "0", access_token: "A", refresh_token: "R", expires_in: 3600, refresh_expires_in: 7200, account: "winkel@x" }, nu)).toEqual({
      access: "A",
      refresh: "R",
      verlooptOp: "2026-11-16T01:00:00.000Z",
      refreshVerlooptOp: "2026-11-16T02:00:00.000Z",
      account: "winkel@x",
    });
    expect(leesTokenAntwoord({ result: { access_token: "A", expires_in: "60", refresh_expires_in: 0 } }, nu)).toMatchObject({ access: "A", refreshVerlooptOp: null });
    expect(leesTokenAntwoord({ code: "IllegalAccessToken", message: "code is invalid" }, nu)).toEqual({ fout: "code is invalid" });
  });
});

describe("de server", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    kv.clear();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("de code wordt een token, dat versleuteld wordt bewaard (nooit leesbaar in de opslag)", async () => {
    const { maakToken, alibabaStand } = await import("@/lib/integrations/alibaba-openapi-server");
    fetchMock.mockResolvedValue({ json: async () => ({ code: "0", access_token: "TOKEN-123", refresh_token: "REFRESH-456", expires_in: 86400 * 30, refresh_expires_in: 86400 * 180, account: "winkel@x" }) });
    await maakToken("code-abc");
    const [url, init] = fetchMock.mock.calls[0] as [string, { body: URLSearchParams }];
    expect(url).toBe("https://gateway.example/rest/auth/token/create");
    expect(init.body.get("code")).toBe("code-abc");
    expect(init.body.get("sign")).toMatch(/^[0-9A-F]{64}$/);
    expect(JSON.stringify([...kv.values()])).not.toMatch(/TOKEN-123|REFRESH-456/);
    expect(await alibabaStand()).toMatchObject({ ingesteld: true, gekoppeld: true, account: "winkel@x", terugAdres: "https://zekerflex.example/api/admin/alibaba/terug" });
  });

  it("een dag voor het verlopen vernieuwen, en het nieuwe token bewaren", async () => {
    const { maakToken, geldigToken } = await import("@/lib/integrations/alibaba-openapi-server");
    fetchMock.mockResolvedValueOnce({ json: async () => ({ access_token: "OUD", refresh_token: "R1", expires_in: 3600, refresh_expires_in: 86400 * 180 }) });
    await maakToken("c");
    fetchMock.mockResolvedValueOnce({ json: async () => ({ access_token: "NIEUW", refresh_token: "R2", expires_in: 86400 * 30, refresh_expires_in: 86400 * 170 }) });
    expect(await geldigToken()).toBe("NIEUW");
    const [url, init] = fetchMock.mock.calls[1] as [string, { body: URLSearchParams }];
    expect(url).toBe("https://gateway.example/rest/auth/token/refresh");
    expect(init.body.get("refresh_token")).toBe("R1");
    // nu ruim geldig: geen nieuw verzoek
    expect(await geldigToken()).toBe("NIEUW");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("de state werkt één keer en 10 minuten", async () => {
    const { nieuweState, stateGeldig } = await import("@/lib/integrations/alibaba-openapi-server");
    const s = await nieuweState();
    expect(await stateGeldig(s)).toBe(true);
    expect(await stateGeldig(s)).toBe(false);
    const oud = await nieuweState();
    expect(await stateGeldig(oud, Date.now() + 11 * 60_000)).toBe(false);
    expect(await stateGeldig("../../iets")).toBe(false);
  });
});

describe("de routes", () => {
  it("alleen voor platformbeheerders, met een eenmalige state vóór het omruilen, en geen code in een log", () => {
    for (const f of ["app/api/admin/alibaba/koppelen/route.ts", "app/api/admin/alibaba/terug/route.ts"]) expect(lees(f)).toContain('withAdminAccess(["PLATFORM_ADMIN"]');
    const terug = lees("app/api/admin/alibaba/terug/route.ts");
    expect(terug.indexOf("stateGeldig(")).toBeLessThan(terug.indexOf("maakToken(code)"));
    expect(terug).not.toMatch(/logger\.\w+\([^)]*code[,}]/);
  });
});
