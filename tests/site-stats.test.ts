import { beforeEach, describe, expect, it, vi } from "vitest";

// Bezoekerscijfers van klantsites (lib/sites/stats*.ts): tellen zonder cookies en
// zonder iets per bezoeker; robots en onze eigen meters tellen niet mee, en een klik
// binnen de site (door de sandbox zonder Referer) is geen nieuwe binnenkomst.

const calls: unknown[][] = [];
const multi = {
  hincrby: (...a: unknown[]) => (calls.push(["hincrby", ...a]), multi),
  expire: (...a: unknown[]) => (calls.push(["expire", ...a]), multi),
  exec: async () => [],
};
const hashes = new Map<string, Record<string, string>>();
vi.mock("@/lib/redis", () => ({
  redis: {
    multi: () => multi,
    pipeline: () => {
      const keys: string[] = [];
      const pipe = { hgetall: (k: string) => (keys.push(k), pipe), exec: async () => keys.map((k) => [null, hashes.get(k) ?? {}]) };
      return pipe;
    },
  },
}));
vi.mock("@/lib/public-shifts", () => ({ publicOpenShifts: async () => [] }));
vi.mock("@/lib/mail", () => ({ sendMail: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: async () => undefined, privateRateLimitIdentifier: (s: string) => s }));
vi.mock("@/lib/storage/kv", () => ({ kvGet: async () => null, kvSet: async () => undefined, kvDelete: async () => undefined, kvListValues: async () => [] }));

const { classifyVisit, lastDays, sourceOf, sumStats, visitHeadersOf } = await import("@/lib/sites/stats-shared");
const { recordSiteView, siteStats } = await import("@/lib/sites/stats");
const { serveSitePath } = await import("@/lib/sites/serve");
const { SECTOR_TEMPLATES, pagesFromTemplate } = await import("@/lib/sites/types");
type VisitHeaders = import("@/lib/sites/stats-shared").VisitHeaders;

const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const OWN = ["zekerflex.com"];
const head = (over: Partial<VisitHeaders> = {}): VisitHeaders => ({ method: "GET", userAgent: CHROME, referer: null, secFetchSite: "none", secFetchDest: "document", purpose: null, ...over });

beforeEach(() => {
  calls.length = 0;
  hashes.clear();
});

describe("classifyVisit", () => {
  it("counts a typed address or a bookmark as a direct visit", () => {
    expect(classifyVisit(head(), OWN)).toEqual({ entry: true, source: "rechtstreeks", mobile: false });
  });

  it("a click inside the sandboxed site (no referer, cross-site) is a view, not a new visit", () => {
    expect(classifyVisit(head({ secFetchSite: "cross-site" }), OWN)).toEqual({ entry: false, source: null, mobile: false });
    expect(classifyVisit(head({ referer: "https://zekerflex.com/werkgever/website", secFetchSite: "same-origin" }), OWN)).toEqual({ entry: false, source: null, mobile: false });
  });

  it("names where a visitor came from, in a few fixed groups", () => {
    const from = (referer: string) => classifyVisit(head({ referer, secFetchSite: "cross-site" }), OWN)?.source;
    expect(from("https://www.google.com/")).toBe("google");
    expect(from("https://www.google.nl/")).toBe("google");
    expect(from("https://gemini.google.com/app")).toBe("ai");
    expect(from("https://chatgpt.com/")).toBe("ai");
    expect(from("https://www.bing.com/")).toBe("zoekmachine");
    expect(from("https://l.facebook.com/")).toBe("social");
    expect(from("https://www.linkedin.com/feed")).toBe("social");
    expect(from("https://bakkerijblog.nl/post/1")).toBe("andere-site");
    expect(sourceOf("google.co.uk")).toBe("google");
    expect(sourceOf("notgoogle.com")).toBe("andere-site");
  });

  it("knows phones and tablets", () => {
    expect(classifyVisit(head({ userAgent: IPHONE }), OWN)?.mobile).toBe(true);
  });

  it("does not count robots, link previews, our own meters, prefetches or frames", () => {
    for (const userAgent of [
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "WhatsApp/2.23.20.0",
      "ZekerFlexWebsiteCheck/1.0 (+https://zekerflex.com/website-check)",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/131.0.0.0 Safari/537.36",
      "curl/8.5.0",
      "node",
      "python-requests/2.31.0",
      "",
    ]) {
      expect(classifyVisit(head({ userAgent }), OWN)).toBeNull();
    }
    expect(classifyVisit(head({ method: "HEAD" }), OWN)).toBeNull();
    expect(classifyVisit(head({ purpose: "prefetch" }), OWN)).toBeNull();
    expect(classifyVisit(head({ secFetchDest: "iframe" }), OWN)).toBeNull();
  });

  it("reads the headers a browser sends", () => {
    const req = new Request("https://zekerflex.com/site/x", { headers: { "user-agent": CHROME, referer: "https://www.google.com/", "sec-fetch-site": "cross-site", "sec-fetch-dest": "document", "sec-purpose": "prefetch" } });
    expect(visitHeadersOf(req)).toEqual({ method: "GET", userAgent: CHROME, referer: "https://www.google.com/", secFetchSite: "cross-site", secFetchDest: "document", purpose: "prefetch" });
  });
});

describe("days and sums", () => {
  it("takes Amsterdam calendar days, also across the clock change", () => {
    expect(lastDays(3, new Date("2026-10-26T12:00:00Z"))).toEqual(["2026-10-24", "2026-10-25", "2026-10-26"]);
    // 23:30 UTC on 2 Nov is already 3 Nov in Amsterdam
    expect(lastDays(2, new Date("2026-11-02T23:30:00Z"))).toEqual(["2026-11-02", "2026-11-03"]);
  });

  it("adds the day counters up and ignores fields it does not know", () => {
    const s = sumStats(["2026-11-01", "2026-11-02", "2026-11-03"], [
      { v: "3", e: "2", "p:": "2", "p:contact": "1", "s:google": "1", "s:rechtstreeks": "1", "d:mobiel": "2", "d:computer": "1" },
      null,
      { v: "1", "p:contact": "1", "d:computer": "1", "s:hacker": "5" },
    ]);
    expect(s.days).toEqual([
      { day: "2026-11-01", views: 3, entries: 2 },
      { day: "2026-11-02", views: 0, entries: 0 },
      { day: "2026-11-03", views: 1, entries: 0 },
    ]);
    expect([s.views, s.entries, s.mobile]).toEqual([4, 2, 2]);
    expect(s.pages).toEqual([{ slug: "", views: 2 }, { slug: "contact", views: 2 }]);
    expect(s.sources).toEqual([{ source: "google", entries: 1 }, { source: "rechtstreeks", entries: 1 }]);
  });
});

describe("recording and reading", () => {
  it("adds one view to the day's counters, plus the visit and its source for an entry", async () => {
    await recordSiteView("s1", "contact", { entry: true, source: "google", mobile: true }, new Date("2026-11-03T10:00:00Z"));
    const k = "site-stats:s1:2026-11-03";
    expect(calls).toEqual([
      ["hincrby", k, "v", 1],
      ["hincrby", k, "p:contact", 1],
      ["hincrby", k, "d:mobiel", 1],
      ["hincrby", k, "e", 1],
      ["hincrby", k, "s:google", 1],
      ["expire", k, 400 * 86_400],
    ]);
  });

  it("a click within the site adds no visit", async () => {
    await recordSiteView("s1", "", { entry: false, source: null, mobile: false }, new Date("2026-11-03T10:00:00Z"));
    expect(calls.some((c) => c[2] === "e")).toBe(false);
  });

  it("reads one hash per day", async () => {
    hashes.set("site-stats:s1:2026-11-03", { v: "5", e: "4", "s:google": "4" });
    const s = await siteStats("s1", 7, new Date("2026-11-03T10:00:00Z"));
    expect(s.days).toHaveLength(7);
    expect(s.days.at(-1)).toEqual({ day: "2026-11-03", views: 5, entries: 4 });
    expect(s.sources).toEqual([{ source: "google", entries: 4 }]);
  });
});

describe("serving a page counts it", () => {
  function liveSite(over: object = {}) {
    let n = 0;
    const company = { naam: "Bakkerij", kvk: "", straat: "", postcode: "", plaats: "Zwolle", telefoon: "", email: "" };
    const pages = pagesFromTemplate(SECTOR_TEMPLATES[0]!, company, () => `b${n++}`);
    return { snapshot: { id: "s1", tenantId: "t1", slug: "bakkerij", theme: { kleur: "#0E5C4A", accent: "#F2B544", lettertype: "modern", hoeken: "rond" }, bedrijf: company, pages, media: [], createdAt: "", updatedAt: "", ...over }, buildId: "b1", siteId: "s1", domein: null } as never;
  }
  const opts = { origin: "https://zekerflex.com", noindex: true, root: "/site/bakkerij/" };
  const browser = () => new Request("https://zekerflex.com/site/bakkerij", { headers: { "user-agent": CHROME, "sec-fetch-site": "none", "sec-fetch-dest": "document" } });
  const counted = () => calls.some((c) => c[0] === "hincrby" && c[2] === "v");

  it("counts a page a person opens", async () => {
    const res = await serveSitePath(liveSite(), [], opts, browser());
    expect(res.status).toBe(200);
    await vi.waitFor(() => expect(counted()).toBe(true));
    expect(calls).toContainEqual(["hincrby", expect.stringMatching(/^site-stats:s1:\d{4}-\d{2}-\d{2}$/), "p:", 1]);
  });

  it("does not count the stylesheet, a missing page, an example, a proposal or a call without request", async () => {
    await serveSitePath(liveSite(), ["assets", "site.css"], opts, browser());
    await serveSitePath(liveSite(), ["bestaat-niet"], opts, browser());
    await serveSitePath(liveSite({ voorbeeld: true }), [], opts, browser());
    await serveSitePath(liveSite({ voorstel: { officieel: "bakkerij.nl", verloopt: "2099-01-01T00:00:00Z" } }), [], opts, browser());
    await serveSitePath(liveSite(), [], opts);
    await new Promise((r) => setTimeout(r, 20));
    expect(counted()).toBe(false);
  });
});
