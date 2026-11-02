import { describe, expect, it, vi } from "vitest";

// De gratis website-check haalt adressen op die een bezoeker intypt. Hij mag
// nooit het eigen netwerk van de server bereiken, en het rapport moet kloppen.

vi.mock("@/lib/storage/kv", () => ({ kvGet: async () => null, kvSet: async () => undefined, kvListValues: async () => [] }));

const { assertFetchableUrl, fetchPage, guardedLookup, FetchError } = await import("@/lib/website-check/fetch");
const { buildFindings, extractFacts, scoreFindings } = await import("@/lib/website-check/analyze");
const { normalizeInput, sameSite } = await import("@/lib/website-check/run");

describe("alleen openbare websites", () => {
  it.each([
    "http://localhost/",
    "http://127.0.0.1/",
    "http://10.0.0.5/",
    "http://192.168.1.1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/",
    "http://app:3000/",
    "http://postgres/",
    "http://ollama:11434/api/tags",
    "https://example.com:8443/",
    "ftp://example.com/",
    "file:///etc/passwd",
    "https://user:pass@example.com/",
    "http://printer.local/",
  ])("weigert %s", (url) => {
    expect(() => assertFetchableUrl(url)).toThrow(FetchError);
  });

  it("staat een gewone website toe", () => {
    expect(assertFetchableUrl("https://www.example.com/pagina?x=1").hostname).toBe("www.example.com");
    expect(assertFetchableUrl("http://example.com/").protocol).toBe("http:");
  });

  it("de DNS-controle in de verbinding weigert namen die naar binnen wijzen", async () => {
    const err = await new Promise<NodeJS.ErrnoException | null>((resolve) => guardedLookup("localhost", {}, (e) => resolve(e)));
    expect(err?.code).toBe("ZF_BLOCKED");
  });

  it("fetchPage komt niet bij de eigen server", async () => {
    await expect(fetchPage("http://127.0.0.1/")).rejects.toMatchObject({ code: "BLOCKED" });
    await expect(fetchPage("http://localhost/")).rejects.toMatchObject({ code: "BLOCKED" });
  });

  it("maakt van wat iemand intypt een volledig adres", () => {
    expect(normalizeInput("bakkerij.nl")).toBe("https://bakkerij.nl/");
    expect(normalizeInput("  http://bakkerij.nl/contact#top ")).toBe("http://bakkerij.nl/contact");
    expect(() => normalizeInput("")).toThrow(FetchError);
  });
});

const GOOD = `<!doctype html><html lang="nl"><head>
<title>Bakkerij Jansen | Vers brood in Utrecht</title>
<meta name="description" content="Elke ochtend vers brood, gebak en taarten uit eigen oven. Bestel online of kom langs in onze winkel in Utrecht.">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta property="og:title" content="Bakkerij Jansen"><meta property="og:image" content="https://bakkerij.nl/og.jpg">
<link rel="canonical" href="https://bakkerij.nl/">
<script type="application/ld+json">{"@type":"Bakery"}</script>
<script src="/app.js" defer></script>
</head><body><h1>Vers brood</h1><img src="/brood.jpg" alt="Brood" loading="lazy">
<a href="/assortiment">Assortiment</a><a href="/contact">Contact</a><a href="tel:+31301234567">Bel ons</a>
<a href="https://instagram.com/bakkerij">Instagram</a></body></html>`;

const BAD = `<html><head><meta name="robots" content="noindex,nofollow"><meta name="generator" content="WordPress 5.2.1">
<script src="http://cdn.oud.nl/jquery.js"></script></head>
<body><img src="/a.jpg"><img src="/b.jpg"><a href="/kapot">Kapot</a></body></html>`;

const page = (html: string, finalUrl: string, headers: Record<string, string> = {}) => ({
  finalUrl,
  status: 200,
  headers,
  html,
  bytes: html.length,
  transferBytes: html.length,
  ttfbMs: 300,
});

describe("rapport", () => {
  it("leest de pagina goed uit", () => {
    const f = extractFacts(GOOD, "https://bakkerij.nl/");
    expect(f.title).toBe("Bakkerij Jansen | Vers brood in Utrecht");
    expect(f.lang).toBe("nl");
    expect(f.h1Count).toBe(1);
    expect(f.jsonLd).toBe(true);
    expect(f.blockingScripts).toBe(0);
    expect(f.hasTel).toBe(true);
    // alleen links op dezelfde site, niet Instagram
    expect(f.internalLinks).toEqual(["https://bakkerij.nl/assortiment", "https://bakkerij.nl/contact"]);
  });

  it("een nette site scoort hoog", () => {
    const facts = extractFacts(GOOD, "https://bakkerij.nl/");
    const findings = buildFindings(page(GOOD, "https://bakkerij.nl/", { "strict-transport-security": "max-age=31536000", "x-content-type-options": "nosniff" }), facts, {
      httpRedirectsTo: "https://bakkerij.nl/",
      robotsTxt: "User-agent: *\nAllow: /\nSitemap: https://bakkerij.nl/sitemap.xml",
      sitemapFound: true,
      links: facts.internalLinks.map((url) => ({ url, status: 200 })),
    });
    expect(findings.filter((x) => x.status === "probleem")).toEqual([]);
    expect(scoreFindings(findings).score).toBeGreaterThanOrEqual(90);
  });

  it("vindt de echte problemen van een slechte site", () => {
    const facts = extractFacts(BAD, "https://oud.nl/");
    const findings = buildFindings(page(BAD, "https://oud.nl/", { "x-powered-by": "PHP/7.4.3" }), facts, {
      httpRedirectsTo: "http://oud.nl/",
      robotsTxt: "User-agent: *\nDisallow: /",
      sitemapFound: false,
      links: [{ url: "https://oud.nl/kapot", status: 404 }],
    });
    const problems = findings.filter((x) => x.status === "probleem").map((x) => x.id);
    expect(problems).toEqual(expect.arrayContaining(["viewport", "title", "noindex", "robots", "mixed", "php", "wp-old", "links"]));
    expect(facts.platform).toBe("WordPress 5.2.1");
    expect(scoreFindings(findings).score).toBeLessThan(50);
  });

  it("doorsturen naar een andere website (toestemmingspagina) wordt gemeld", () => {
    expect(sameSite("bakkerij.nl", "www.bakkerij.nl")).toBe(true);
    expect(sameSite("www.bakkerij.nl", "shop.bakkerij.nl")).toBe(true);
    expect(sameSite("bakkerij.nl", "slagerij.nl")).toBe(false);
    expect(sameSite("bakkerij.nl", "shop.bakkerij.nl")).toBe(true);
    expect(sameSite("nu.nl", "myprivacy.dpgmedia.nl")).toBe(false);
    const facts = extractFacts(GOOD, "https://myprivacy.dpgmedia.nl/consent");
    const findings = buildFindings(page(GOOD, "https://myprivacy.dpgmedia.nl/consent"), facts, {
      httpRedirectsTo: null,
      robotsTxt: null,
      sitemapFound: false,
      links: [],
      redirectedToOtherSite: "myprivacy.dpgmedia.nl",
    });
    expect(findings.find((x) => x.id === "other-site")?.title).toBe("Je adres stuurt door naar myprivacy.dpgmedia.nl");
  });

  it("een robots.txt die alleen één crawler blokkeert, blokkeert niet alles", () => {
    const facts = extractFacts(GOOD, "https://bakkerij.nl/");
    const findings = buildFindings(page(GOOD, "https://bakkerij.nl/"), facts, {
      httpRedirectsTo: null,
      robotsTxt: "User-agent: BadBot\nDisallow: /\n\nUser-agent: *\nDisallow: /admin",
      sitemapFound: true,
      links: [],
    });
    expect(findings.find((x) => x.id === "robots")).toBeUndefined();
  });
});
