import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const kv = vi.hoisted(() => ({ opslag: new Map<string, unknown>(), kapot: false }));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => {
    if (kv.kapot) throw new Error("kv weg");
    return kv.opslag.get(k) ?? null;
  },
  kvSet: async (k: string, v: unknown) => {
    if (kv.kapot) throw new Error("kv weg");
    kv.opslag.set(k, v);
  },
}));

const rl = vi.hoisted(() => ({ ok: true, kapot: false, sleutels: [] as string[], limiet: 0, venster: 0 }));
vi.mock("@/lib/rate-limit", () => ({
  privateRateLimitIdentifier: (id: string) => `h(${id.length})`,
  fixedWindow: async (sleutel: string, limiet: number, venster: number) => {
    if (rl.kapot) throw new Error("redis weg");
    rl.sleutels.push(sleutel);
    rl.limiet = limiet;
    rl.venster = venster;
    return { ok: rl.ok, count: 0, limit: limiet, remaining: 0, retryAfterSeconds: 0 };
  },
}));

import { TAALVRAAG_CODES, TAALVRAAG_COOKIE, eersteTaalcode, taalVraagSleutel, telTaalVraag } from "@/lib/i18n/taal-vraag";
import { POST } from "@/app/api/analytics/taal-vraag/route";
import { isPublicApiRoute } from "@/lib/auth/public-routes";

const NU = new Date("2026-11-13T10:00:00+01:00");

beforeEach(() => {
  kv.opslag.clear();
  kv.kapot = false;
  rl.ok = true;
  rl.kapot = false;
  rl.sleutels = [];
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NU);
});
afterEach(() => vi.useRealTimers());

describe("eersteTaalcode", () => {
  it("neemt de eerste taal uit Accept-Language", () => {
    expect(eersteTaalcode("tr-TR,tr;q=0.9,en;q=0.8")).toBe("tr");
    expect(eersteTaalcode("BG")).toBe("bg");
    expect(eersteTaalcode("nl-NL")).toBe("nl");
    expect(eersteTaalcode("uk;q=0.9")).toBe("uk");
  });
  it("alles buiten de vaste lijst, leeg of rommel is overig", () => {
    expect(eersteTaalcode("sw-KE")).toBe("overig");
    expect(eersteTaalcode("")).toBe("overig");
    expect(eersteTaalcode(null)).toBe("overig");
    expect(eersteTaalcode("*")).toBe("overig");
    expect(eersteTaalcode("constructor")).toBe("overig");
  });
  it("de lijst is klein en vast", () => {
    expect(TAALVRAAG_CODES.length).toBeLessThan(40);
    for (const c of ["tr", "bg", "es", "pt", "ar"]) expect(TAALVRAAG_CODES).toContain(c);
  });
});

describe("telTaalVraag", () => {
  it("telt per dag (Amsterdam) alleen een teller per taalcode, zonder iets over de bezoeker", async () => {
    expect(taalVraagSleutel(NU)).toBe("meting:taal-vraag:2026-11-13");
    expect(taalVraagSleutel(new Date("2026-11-13T23:30:00Z"))).toBe("meting:taal-vraag:2026-11-14"); // 00:30 in Amsterdam
    await telTaalVraag("tr-TR,tr;q=0.9");
    await telTaalVraag("tr");
    await telTaalVraag("xx");
    expect([...kv.opslag.keys()]).toEqual(["meting:taal-vraag:2026-11-13"]);
    expect(kv.opslag.get("meting:taal-vraag:2026-11-13")).toEqual({ tr: 2, overig: 1 });
  });

  it("is fail-open: een KV-storing telt niet en gooit niet", async () => {
    kv.kapot = true;
    await expect(telTaalVraag("tr")).resolves.toBe(false);
  });
});

describe("POST /api/analytics/taal-vraag", () => {
  const maak = (kop: Record<string, string>) => new Request("http://app:3000/api/analytics/taal-vraag", { method: "POST", headers: kop });

  it("is openbaar bereikbaar", () => {
    expect(isPublicApiRoute("/api/analytics/taal-vraag")).toBe(true);
  });

  it("telt één keer per sessie: het cookie 'al geteld' houdt de tweede telling tegen", async () => {
    const r1 = await POST(maak({ "accept-language": "bg-BG,bg;q=0.9", "user-agent": "Mozilla/5.0" }));
    expect(r1.status).toBe(204);
    expect(r1.headers.get("set-cookie")).toContain(`${TAALVRAAG_COOKIE}=1`);
    const r2 = await POST(maak({ "accept-language": "bg", "user-agent": "Mozilla/5.0", cookie: `${TAALVRAAG_COOKIE}=1` }));
    expect(r2.status).toBe(204);
    expect(kv.opslag.get("meting:taal-vraag:2026-11-13")).toEqual({ bg: 1 });
  });

  it("telt geen bots en blokkeert nooit bij een KV-storing", async () => {
    await POST(maak({ "accept-language": "tr", "user-agent": "Googlebot/2.1" }));
    expect(kv.opslag.size).toBe(0);
    kv.kapot = true;
    const r = await POST(maak({ "accept-language": "tr", "user-agent": "Mozilla/5.0" }));
    expect(r.status).toBe(204);
  });

  it("bewaart geen IP, gebruiker of pad: alleen getallen per taalcode", async () => {
    await POST(maak({ "accept-language": "es-ES", "user-agent": "Mozilla/5.0", "x-forwarded-for": "203.0.113.9" }));
    expect(JSON.stringify([...kv.opslag])).not.toMatch(/203\.0\.113|user|path|pad/i);
  });
});

describe("limiet per IP (20 per uur)", () => {
  const maak = () => new Request("http://app:3000/api/analytics/taal-vraag", { method: "POST", headers: { "accept-language": "tr", "user-agent": "Mozilla/5.0", "x-forwarded-for": "203.0.113.9" } });

  it("onder de limiet wordt er geteld, met een gehasht IP in de sleutel", async () => {
    await POST(maak());
    expect(kv.opslag.get("meting:taal-vraag:2026-11-13")).toEqual({ tr: 1 });
    expect(rl.limiet).toBe(20);
    expect(rl.venster).toBe(3600);
    expect(rl.sleutels).toHaveLength(1);
    expect(rl.sleutels[0]).toMatch(/^rl:taal-vraag:h\(\d+\)$/);
    expect(rl.sleutels[0]).not.toContain("203.0.113.9");
  });

  it("boven de limiet: stil 204, zonder te tellen en zonder cookie", async () => {
    rl.ok = false;
    const r = await POST(maak());
    expect(r.status).toBe(204);
    expect(kv.opslag.size).toBe(0);
    expect(r.headers.get("set-cookie")).toBeNull();
  });

  it("faalt de limiet zelf, dan wordt er wel geteld (fail-open)", async () => {
    rl.kapot = true;
    const r = await POST(maak());
    expect(r.status).toBe(204);
    expect(kv.opslag.get("meting:taal-vraag:2026-11-13")).toEqual({ tr: 1 });
  });
});