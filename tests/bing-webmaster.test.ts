import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Bing Webmaster-indiening (lib/seo/bing-webmaster.ts, 16 nov 2026): naast IndexNow onze sitemap-URL's bij Bing indienen,
// binnen het dagquotum en met omloop. Zonder sleutel een no-op; faalt stil.

const kv = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: vi.fn(async (k: string) => (kv.has(k) ? kv.get(k) : null)),
  kvSet: vi.fn(async (k: string, v: unknown) => void kv.set(k, v)),
}));
vi.mock("@/lib/seo", () => ({ SITE: { url: "https://zekerflex.com" } }));
vi.mock("@/lib/security/sealed-secret", () => ({
  sealSecret: (p: string) => `sealed:${p}`,
  openSecret: (s: string) => s.replace(/^sealed:/, ""),
}));
vi.mock("@/lib/env", () => ({ env: { BING_WEBMASTER_KEY: undefined } }));

import { kiesIndienBatch, bingDienBatchIn, bingWebmasterKey, setBingWebmasterKey } from "@/lib/seo/bing-webmaster";

const u = (n: number) => `https://zekerflex.com/p${n}`;
const lijst = Array.from({ length: 10 }, (_, i) => u(i));

beforeEach(() => kv.clear());
afterEach(() => vi.unstubAllGlobals());

describe("kiesIndienBatch (omloop)", () => {
  it("pakt vanaf de cursor, hooguit max, en geeft de volgende cursor", () => {
    expect(kiesIndienBatch(lijst, 0, 3)).toEqual({ batch: [u(0), u(1), u(2)], volgende: 3 });
    expect(kiesIndienBatch(lijst, 8, 3)).toEqual({ batch: [u(8), u(9), u(0)], volgende: 1 });
  });
  it("loopt nooit vast op lege lijst of max 0", () => {
    expect(kiesIndienBatch([], 5, 3)).toEqual({ batch: [], volgende: 0 });
    expect(kiesIndienBatch(lijst, 0, 0)).toEqual({ batch: [], volgende: 0 });
  });
  it("pakt nooit meer dan de lijst, ook bij een grote max", () => {
    const r = kiesIndienBatch(lijst, 0, 999);
    expect(r.batch).toHaveLength(10);
    expect(new Set(r.batch).size).toBe(10);
  });
});

describe("de sleutel", () => {
  it("leest hem verzegeld uit Beheer, anders uit de omgeving", async () => {
    expect(await bingWebmasterKey()).toBeNull();
    await setBingWebmasterKey("abc123");
    expect(kv.get("bing:webmaster-key")).toBe("sealed:abc123");
    expect(await bingWebmasterKey()).toBe("abc123");
    await setBingWebmasterKey("");
    expect(await bingWebmasterKey()).toBeNull();
  });
});

describe("bingDienBatchIn", () => {
  it("doet niets zonder sleutel", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const r = await bingDienBatchIn(lijst);
    expect(r).toMatchObject({ ingediend: 0, reden: "geen sleutel" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("dient binnen het dagquotum in en schuift de cursor door", async () => {
    await setBingWebmasterKey("k");
    const calls: { url: string; body?: unknown }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (url.includes("GetUrlSubmissionQuota")) return new Response(JSON.stringify({ d: { DailyQuota: 4 } }), { status: 200 });
      return new Response(JSON.stringify({ d: null }), { status: 200 });
    }));
    const r = await bingDienBatchIn(lijst);
    expect(r).toMatchObject({ ingediend: 4, ok: true });
    const submit = calls.find((c) => c.url.includes("SubmitUrlBatch"));
    expect((submit?.body as { urlList: string[] }).urlList).toHaveLength(4);
    expect(kv.get("bing:indien-cursor")).toBe(4);
    // de sleutel staat in de query, niet in het log van de test (we controleren alleen dat SubmitUrlBatch geraakt is)
    expect(submit?.url).toContain("SubmitUrlBatch");
  });

  it("slaat over als het dagquotum op is", async () => {
    await setBingWebmasterKey("k");
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("GetUrlSubmissionQuota")) return new Response(JSON.stringify({ d: { DailyQuota: 0 } }), { status: 200 });
      return new Response("{}", { status: 200 });
    }));
    const r = await bingDienBatchIn(lijst);
    expect(r).toMatchObject({ ingediend: 0, ok: true, reden: "quotum op voor vandaag" });
  });

  it("faalt stil bij een fout van Bing", async () => {
    await setBingWebmasterKey("k");
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("GetUrlSubmissionQuota")) return new Response(JSON.stringify({ d: { DailyQuota: 5 } }), { status: 200 });
      return new Response("nee", { status: 500 });
    }));
    const r = await bingDienBatchIn(lijst);
    expect(r).toMatchObject({ ingediend: 0, ok: false });
  });
});
