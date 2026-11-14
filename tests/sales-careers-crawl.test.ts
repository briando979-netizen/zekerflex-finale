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

// de crawler haalt pagina's op via de beveiligde fetcher (SSRF-vrij); hier nagebootst
const fetchMock = vi.fn();
vi.mock("@/lib/website-check/fetch", () => ({ fetchPage: (url: string) => fetchMock(url) }));
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

// Opgeslagen voorbeeld (ingekort) van een hotelsite die zijn vacatures bij een vacaturedienst zet:
// de homepage heeft een mailto en in de footer een link "Vacatures" naar <slug>.recruitee.com,
// plus losse externe links die de crawler nooit mag volgen.
const HOTEL_HOME = html(
  `<footer>
     <a href="mailto:receptie@hotelzuidbroek.test">receptie@hotelzuidbroek.test</a>
     <a href="https://www.facebook.com/hotelzuidbroek">Facebook</a>
     <a href="https://willekeurig.test/vacatures">Vacatures elders</a>
     <a href="http://hotelzuidbroek.recruitee.com/">Oude link zonder https</a>
     <a href="https://hotelzuidbroek.recruitee.com/">Vacatures</a>
   </footer>`,
  "Hotel Zuidbroek",
);
const HOTEL_RECRUITEE = html(
  `<h1>Werken bij Hotel Zuidbroek</h1>
   <ul><li>Medewerker bediening (parttime)</li><li>Kamermeisje</li></ul>
   <a href="https://hotelzuidbroek.recruitee.com/o/afwasser">Afwasser horeca</a>
   <p>Powered by Recruitee · <a href="mailto:support@recruitee.com">support@recruitee.com</a></p>`,
  "Recruitee",
);

const PAGES: Record<string, ReturnType<typeof res>> = {
  "https://hotelzuidbroek.test/robots.txt": res(404, "text/plain", ""),
  "https://hotelzuidbroek.test/sitemap.xml": res(404, "text/plain", ""),
  "https://hotelzuidbroek.test/": res(200, "text/html; charset=utf-8", HOTEL_HOME),
  "https://hotelzuidbroek.recruitee.com/robots.txt": res(200, "text/plain", "User-agent: *\nDisallow: /o/geheim"),
  "https://hotelzuidbroek.recruitee.com/": res(200, "text/html", HOTEL_RECRUITEE),
  "https://hotelzuidbroek.recruitee.com/o/afwasser": res(200, "text/html", html(`<h2>Afwasser</h2>`)),
  "https://acme.test/werkenbij-extern": res(
    200,
    "text/html",
    html(`<a href="https://werkenbij.acme.test/">Werken bij</a> <a href="https://werkenbij.ander.test/">Ander bedrijf</a>`),
  ),
  "https://werkenbij.acme.test/robots.txt": res(404, "text/plain", ""),
  "https://werkenbij.acme.test/": res(200, "text/html", html(`<h2>Chauffeur CE gezocht</h2>`)),
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

async function alsPagina(r: ReturnType<typeof res>) {
  return { status: r.status, headers: { "content-type": r.headers.get("content-type") ?? "" }, body: new TextDecoder().decode(await r.arrayBuffer()) };
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => alsPagina(PAGES[url.split("#")[0]!] ?? res(404, "text/html", "")));
});

afterEach(() => {
  vi.clearAllMocks();
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

  it("maakt één sprong naar het vacaturesysteem van het bedrijf en vindt daar het signaal", async () => {
    const r = await crawlCareersSource({ ...source, url: "https://hotelzuidbroek.test/" } as SalesDiscoverySource);
    const fetched = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(fetched).toContain("https://hotelzuidbroek.recruitee.com/");
    expect(fetched).toContain("https://hotelzuidbroek.recruitee.com/robots.txt");
    // niet: willekeurige derden, http zonder s, en links óp de pagina van de dienst (hooguit één sprong)
    expect(fetched.some((u) => u.includes("facebook.com"))).toBe(false);
    expect(fetched.some((u) => u.includes("willekeurig.test"))).toBe(false);
    expect(fetched.some((u) => u.startsWith("http://"))).toBe(false);
    expect(fetched).not.toContain("https://hotelzuidbroek.recruitee.com/o/afwasser");
    expect(r.sprong).toBe("hotelzuidbroek.recruitee.com");
    expect(String(r.vacancySignal)).toMatch(/bediening/i);
    expect(r.companyName).toBe("Hotel Zuidbroek");
    // het adres van de dienst zelf is nooit het adres van het bedrijf
    expect(r.emailFound).toBe("receptie@hotelzuidbroek.test");
  });

  it("zonder link naar een vacaturedienst blijft een externe link gewoon ongevolgd (geen signaal)", async () => {
    PAGES["https://los.test/"] = res(200, "text/html", html(`<a href="https://willekeurig.test/vacatures">Vacatures</a>`, "Los"));
    PAGES["https://los.test/robots.txt"] = res(404, "text/plain", "");
    PAGES["https://los.test/sitemap.xml"] = res(404, "text/plain", "");
    const r = await crawlCareersSource({ ...source, url: "https://los.test/" } as SalesDiscoverySource);
    const fetched = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(fetched.some((u) => u.includes("willekeurig.test"))).toBe(false);
    expect(r.vacancySignal).toBeNull();
    expect(r.sprong).toBeUndefined();
  });

  it("een werken-bij-subdomein van het eigen domein telt als sprong, dat van een ander bedrijf niet", async () => {
    const r = await crawlCareersSource({ ...source, url: "https://acme.test/werkenbij-extern" } as SalesDiscoverySource);
    const fetched = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(fetched).toContain("https://werkenbij.acme.test/");
    expect(fetched.some((u) => u.includes("werkenbij.ander.test"))).toBe(false);
    expect(String(r.vacancySignal)).toMatch(/chauffeur/i);
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
