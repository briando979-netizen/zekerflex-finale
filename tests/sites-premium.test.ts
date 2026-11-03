import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

// De premium-huisstijl voor gebouwde websites (sinds 3 nov 2026, zoals
// schwarzwald.zekerflex.com): donkere opening met label, grote koppen, ronde
// knoppen, witte kaarten op crème en zand, een volle footer. Lettertypes komen
// van de site zelf, kleine tekst haalt WCAG AA, bestaande stijlen blijven gelijk.

vi.mock("@/lib/sites/store", () => ({ readMedia: vi.fn(), storeContactMessage: vi.fn() }));
vi.mock("@/lib/sites/vacancies", () => ({ siteVacancies: vi.fn(async () => []), vacancyCount: () => 0 }));
vi.mock("@/lib/mail", () => ({ sendMail: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: async () => undefined, privateRateLimitIdentifier: (s: string) => s }));

const { CREAM, SAND, SITE_FONT_FILES, contrast, darkAccent, premiumTokens, renderPage, siteCss } = await import("@/lib/sites/render");
const { serveSitePath } = await import("@/lib/sites/serve");
const { siteHostCsp } = await import("@/lib/security/csp");
const { SECTOR_TEMPLATES, pagesFromTemplate } = await import("@/lib/sites/types");
type SiteDoc = import("@/lib/sites/types").SiteDoc;

const company = { naam: "Bakkerij Test", kvk: "12345678", straat: "Dorpsstraat 1", postcode: "1234 AB", plaats: "Rijssen", telefoon: "0548-123456", email: "info@bakkerij.nl" };
let n = 0;
const id = () => `p${(n++).toString(36).padStart(6, "0")}`;
function site(stijl?: "standaard" | "luxe" | "premium"): SiteDoc {
  return {
    id: "spremium1",
    tenantId: "t1",
    slug: "bakkerij",
    theme: { kleur: "#9B1D3A", accent: "#F5C04E", lettertype: "modern", hoeken: "rond", ...(stijl ? { stijl } : {}) },
    bedrijf: company,
    pages: pagesFromTemplate(SECTOR_TEMPLATES.find((t) => t.id === "horeca")!, company, id),
    media: [],
    liveBuild: null,
    builds: [],
    createdAt: "2026-11-03T12:00:00Z",
    updatedAt: "2026-11-03T12:00:00Z",
  };
}
const opts = { root: "/site/bakkerij/", origin: "https://zekerflex.com", version: "v1", noindex: true };

describe("premium-stijl", () => {
  it("komt alleen bij premium, met de lettertypes van de site zelf", () => {
    const css = siteCss(site("premium").theme);
    expect(css).toContain('@font-face{font-family:"Bricolage Grotesque";font-style:normal;font-weight:500 700;font-display:swap;src:url(fonts/bricolage-grotesque-latin.4fd48b2c.woff2) format("woff2")');
    expect(css).toContain("--cream:#FFF6EA");
    expect(css).toContain(".hero.photo::after");
    expect(siteCss(site("premium").theme, "/fonts/")).toContain("src:url(/fonts/instrument-sans-latin.6219bc4b.woff2)");
    for (const other of [site(), site("standaard"), site("luxe")]) expect(siteCss(other.theme)).not.toContain("Bricolage");
  });

  it("kleine tekst in de accentkleur haalt WCAG AA op zand en crème, lichte tekst op de donkere tonen ook", () => {
    for (const a of ["#FF5F1F", "#F2B544", "#3FC1A5", "#B8925A", "#D4A24C", "#FFFFFF", "#000000"]) {
      expect(contrast(darkAccent(a), SAND)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(darkAccent(a), CREAM)).toBeGreaterThanOrEqual(4.5);
    }
    expect(darkAccent("#1D4E89")).toBe("#1d4e89"); // al donker genoeg: niet nodeloos donkerder
    for (const k of ["#0E5C4A", "#F2B544", "#FFFFFF", "#9B1D3A"]) expect(contrast(CREAM, premiumTokens(k, "#F5C04E").night)).toBeGreaterThanOrEqual(7);
  });

  it("geeft de opening een label, de kop een balk en een knop, en de footer openingstijden en menu", () => {
    const s = site("premium");
    const html = renderPage(s, s.pages[0]!, opts);
    expect(html).toContain('<p class="eyebrow">Bakkerij Test · Rijssen</p><h1>');
    expect(html).toContain('<div class="topbar">Bel ons: <a href="tel:0548123456">0548-123456</a> · <a href="mailto:info@bakkerij.nl">info@bakkerij.nl</a></div>');
    expect(html).toContain('<a class="btn cta-top" href="/site/bakkerij/contact">Contact</a>');
    expect(html).toContain("<h3>Menu</h3>");
    expect(html).toContain("<p>KVK 12345678</p>");
    const contact = s.pages.find((p) => p.slug === "contact")!;
    expect(renderPage(s, contact, opts)).toContain('<a class="btn cta-top" href="#contact">Contact</a>');
    // de andere stijlen houden precies hun opmaak
    const plain = renderPage(site(), site().pages[0]!, opts);
    for (const bit of ['class="eyebrow"', 'class="topbar"', "cta-top", "<h3>Menu</h3>"]) expect(plain).not.toContain(bit);
  });

  it("heeft de openingstijden uit het blok in de footer, als het er is", () => {
    const s = site("premium");
    const hours = s.pages.flatMap((p) => p.blocks).find((b) => b.type === "openingstijden");
    const html = renderPage(s, s.pages[0]!, opts);
    if (hours?.type === "openingstijden" && hours.props.regels.length) expect(html).toContain(`<dl class="foot-hours"><dt>${hours.props.regels[0]!.dag}</dt>`);
    else expect(html).not.toContain("foot-hours");
  });
});

describe("lettertypes van de site zelf", () => {
  const live = (s: SiteDoc) => ({ snapshot: { ...s, voorstel: undefined }, buildId: "b1", siteId: s.id, domein: null }) as never;

  it("bestaan echt in public/fonts", () => {
    for (const f of SITE_FONT_FILES) expect(existsSync(join(process.cwd(), "public", "fonts", f))).toBe(true);
  });

  it("serveert alleen de bekende bestanden, met CORS want de pagina draait in een sandbox", async () => {
    const res = await serveSitePath(live(site("premium")), ["assets", "fonts", SITE_FONT_FILES[0]], opts);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("font/woff2");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Cache-Control")).toContain("immutable");
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(1000);
    for (const bad of ["../../.env.production", "geist-latin.woff2", "x.woff2"]) {
      expect((await serveSitePath(live(site("premium")), ["assets", "fonts", bad], opts)).status).toBe(404);
    }
  });

  it("de CSP van een gebouwde site laat eigen lettertypes toe, en nog steeds geen scripts", () => {
    const csp = siteHostCsp("https://bakkerij.nl");
    expect(csp).toContain("font-src 'self' https://bakkerij.nl");
    expect(csp).toContain("default-src 'none'");
    expect(csp).not.toContain("script-src");
  });
});
