import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createLead = vi.fn().mockResolvedValue({ id: "lead_new" });
vi.mock("@/lib/sales/leads", () => ({ createLead: (...a: unknown[]) => createLead(...a) }));

const leadFindFirst = vi.fn().mockResolvedValue(null);
const leadUpdate = vi.fn().mockResolvedValue({});
vi.mock("@/lib/prisma", () => ({
  prisma: {
    salesLead: {
      findFirst: (...a: unknown[]) => leadFindFirst(...a),
      update: (...a: unknown[]) => leadUpdate(...a),
    },
  },
}));

vi.mock("@/lib/redis", () => ({
  redis: { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue("OK") },
}));

import { crawlCareersSource } from "@/lib/sales/discovery/careers";
import type { SalesDiscoverySource } from "@prisma/client";

function html(body: string, title = "Acme Personeel") {
  return `<!doctype html><html><head><title>${title}</title></head><body>${body}</body></html>`;
}

function res(status: number, contentType: string, text: string) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (h: string) => (h.toLowerCase() === "content-type" ? contentType : null) },
    arrayBuffer: async () => new TextEncoder().encode(text).buffer,
  };
}

const PAGES: Record<string, ReturnType<typeof res>> = {
  "https://acme.test/robots.txt": res(200, "text/plain", "User-agent: *\nDisallow: /vacatures/geheim"),
  "https://acme.test/sitemap.xml": res(404, "text/plain", ""),
  "https://acme.test/werken-bij": res(
    200,
    "text/html; charset=utf-8",
    html(
      `<a href="/vacatures/kok">Kok</a>
       <a href="/vacatures/geheim">Geheim</a>
       <p>Mail ons: <a href="mailto:info@acme.test">info@acme.test</a> of recruitment@acme.test</p>`,
    ),
  ),
  "https://acme.test/vacatures/kok": res(200, "text/html", html(`<h2>Kok medewerker gezocht</h2>`)),
  "https://acme.test/vacatures/geheim": res(200, "text/html", html(`<h2>Geheime magazijn functie</h2>`)),
};

const source = {
  id: "src_1",
  campaignId: "camp_1",
  kind: "CAREERS_URL",
  url: "https://acme.test/werken-bij",
  label: null,
} as unknown as SalesDiscoverySource;

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async (url: string) => {
    const hit = PAGES[url.split("#")[0]!];
    if (hit) return hit as unknown as Response;
    return res(404, "text/html", "") as unknown as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("careers crawler", () => {
  it("respects a robots.txt Disallow", async () => {
    await crawlCareersSource(source);
    const fetched = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(fetched).toContain("https://acme.test/vacatures/kok");
    expect(fetched).not.toContain("https://acme.test/vacatures/geheim");
  });

  it("prefers a recruitment@ address over info@ and creates a lead", async () => {
    const r = await crawlCareersSource(source);
    expect(r.created).toBe(1);
    expect(createLead).toHaveBeenCalledOnce();
    const arg = createLead.mock.calls[0]![0] as Record<string, unknown>;
    expect(arg.discoveredEmail).toBe("recruitment@acme.test");
    expect(String(arg.vacancySignal)).toMatch(/kok/i);
    expect(arg.campaignId).toBe("camp_1");
  });

  it("ignores non-HTML responses without crashing", async () => {
    PAGES["https://acme.test/werken-bij"] = res(200, "application/pdf", "%PDF-1.4");
    const r = await crawlCareersSource(source);
    expect(r.pagesFetched).toBeGreaterThan(0);
    // restore
    PAGES["https://acme.test/werken-bij"] = res(
      200,
      "text/html",
      html(`<p>recruitment@acme.test</p>`),
    );
  });
});
