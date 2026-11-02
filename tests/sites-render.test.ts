import { describe, expect, it } from "vitest";
import { renderPage, renderRobots, renderSitemap, renderSystemPage, safeHref, siteCss, textOn, type RenderOptions } from "@/lib/sites/render";
import { SECTOR_TEMPLATES, newBlock, pagesFromTemplate, slugify, type Company, type SiteDoc } from "@/lib/sites/types";
import { buildContentSecurityPolicy } from "@/lib/security/csp";

// De websites die ZekerFlex voor klanten maakt: alles wat een klant typt wordt
// onschadelijk gemaakt, links kunnen nooit javascript: zijn, en dezelfde
// pagina werkt op zekerflex.com/site/<naam> en straks op een eigen domein.

const company: Company = { naam: 'Bakkerij <script>alert("x")</script> & Zn', kvk: "12345678", straat: "Dorpsstraat 1", postcode: "1234 AB", plaats: "Rijssen", telefoon: "0548-123456", email: "info@bakkerij.nl" };
let n = 0;
const id = () => `b${(n++).toString(36).padStart(6, "0")}`;

function site(over: Partial<SiteDoc> = {}): SiteDoc {
  const template = SECTOR_TEMPLATES.find((t) => t.id === "horeca")!;
  return {
    id: "sabcdef12",
    tenantId: "t1",
    slug: "bakkerij",
    theme: { kleur: "#9B1D3A", accent: "#F5C04E", lettertype: "modern", hoeken: "rond" },
    bedrijf: company,
    pages: pagesFromTemplate(template, company, id),
    media: [{ id: "mfoto0001", file: "mfoto0001.webp", width: 1600, height: 1067, alt: 'Onze "winkel"', bron: "upload" }],
    liveBuild: null,
    builds: [],
    createdAt: "2026-11-02T20:00:00Z",
    updatedAt: "2026-11-02T20:00:00Z",
    ...over,
  };
}
const opts: RenderOptions = { root: "/site/bakkerij/", origin: "https://zekerflex.com", version: "v1", noindex: true };

describe("veilig maken van alles wat de klant typt", () => {
  it("zet een script in de bedrijfsnaam nooit als script op de pagina", () => {
    const s = site();
    const html = renderPage(s, s.pages[0]!, opts);
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("Bakkerij &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; Zn");
    // het enige script is de JSON-LD voor Google, en daarin is < onschadelijk gemaakt
    const scripts = html.match(/<script[^>]*>/g) ?? [];
    expect(scripts).toEqual(['<script type="application/ld+json">']);
    const ld = html.split('<script type="application/ld+json">')[1]!.split("</script>")[0]!;
    expect(ld).not.toContain("<");
    expect(JSON.parse(ld)).toMatchObject({ "@type": "LocalBusiness", name: company.naam, address: { addressLocality: "Rijssen" } });
  });

  it("laat alleen veilige links door", () => {
    const pages = [{ slug: "" }, { slug: "contact" }];
    expect(safeHref("javascript:alert(1)", "/site/x/", pages)).toBe("#");
    expect(safeHref(" JaVaScRiPt:alert(1)", "/site/x/", pages)).toBe("#");
    expect(safeHref("data:text/html,<b>", "/site/x/", pages)).toBe("#");
    expect(safeHref("//evil.example", "/site/x/", pages)).toBe("#");
    expect(safeHref('https://ok.nl/"onmouseover=x', "/site/x/", pages)).toBe("#");
    expect(safeHref("https://www.bakkerij.nl/menu", "/site/x/", pages)).toBe("https://www.bakkerij.nl/menu");
    expect(safeHref("tel:+31548123456", "/site/x/", pages)).toBe("tel:+31548123456");
    expect(safeHref("contact", "/site/x/", pages)).toBe("/site/x/contact");
    expect(safeHref("/contact/", "/", pages)).toBe("/contact");
    expect(safeHref("home", "/site/x/", pages)).toBe("/site/x");
    expect(safeHref("bestaat-niet", "/site/x/", pages)).toBe("#");
    expect(safeHref("privacy", "/", pages)).toBe("/privacy");
  });

  it("gebruikt alleen echte kleuren en leesbare tekst op knoppen", () => {
    const css = siteCss({ kleur: "red;}body{display:none", accent: "#ffffff", lettertype: "modern", hoeken: "strak" });
    expect(css).toContain("--k:#0E5C4A");
    expect(css).not.toContain("red;}body");
    expect(textOn("#ffffff")).toBe("#141414");
    expect(textOn("#0E5C4A")).toBe("#ffffff");
  });

  it("toont alleen foto's van de site zelf, met beschrijving en afmetingen", () => {
    const s = site();
    const hero = s.pages[0]!.blocks[0]!;
    if (hero.type === "hero") hero.props.foto = "mfoto0001";
    const html = renderPage(s, s.pages[0]!, opts);
    expect(html).toContain('src="/site/bakkerij/media/mfoto0001.webp" alt="Onze &quot;winkel&quot;" width="1600" height="1067"');
    expect(html).toContain('<meta property="og:image" content="https://zekerflex.com/site/bakkerij/media/mfoto0001.webp">');
    if (hero.type === "hero") hero.props.foto = "monbekend1";
    expect(renderPage(s, s.pages[0]!, opts)).not.toContain("monbekend1");
  });
});

describe("een complete, nette website", () => {
  it("heeft het KVK-nummer onderaan, een privacyverklaring en een werkend formulier", () => {
    const s = site();
    const contact = s.pages.find((p) => p.slug === "contact")!;
    const html = renderPage(s, contact, opts);
    expect(html).toContain("KVK 12345678");
    expect(html).toContain('action="/site/bakkerij/_zf/contact"');
    expect(html).toContain('name="website"'); // het onzichtbare veld tegen spam
    expect(html).toContain('href="/site/bakkerij/privacy"');
    expect(renderSystemPage(s, "privacy", opts)).toContain("geen cookies");
  });

  it("legt links zonder schuine streep aan het eind, zodat ze op elke diepte kloppen", () => {
    const s = site();
    const html = renderPage(s, s.pages[1]!, opts);
    expect(html).toContain('href="/site/bakkerij/contact"');
    expect(html).toContain('<a class="logo" href="/site/bakkerij">');
    expect(html).toContain('href="/site/bakkerij/assets/site.css?v=v1"');
    expect(renderSystemPage(s, "404", opts)).toContain('href="/site/bakkerij"');
  });

  it("werkt ook op een eigen domein, met sitemap en robots", () => {
    const s = site();
    const own: RenderOptions = { root: "/", origin: "https://www.bakkerij.nl" };
    const html = renderPage(s, s.pages[0]!, own);
    expect(html).toContain('<link rel="canonical" href="https://www.bakkerij.nl/">');
    expect(html).not.toContain('content="noindex"');
    expect(renderSitemap(s, own)).toContain("<loc>https://www.bakkerij.nl/over-ons</loc>");
    expect(renderRobots(own)).toContain("Sitemap: https://www.bakkerij.nl/sitemap.xml");
    expect(renderRobots(opts)).toContain("Disallow: /");
  });

  it("maakt in het voorbeeld alle links dood en laadt foto's via de bouwer", () => {
    const s = site();
    const hero = s.pages[0]!.blocks[0]!;
    if (hero.type === "hero") hero.props.foto = "mfoto0001";
    const html = renderPage(s, s.pages[0]!, { root: "/", origin: "https://zekerflex.com", preview: { mediaUrl: (f) => `/api/werkgever/sites/media/${f}` } });
    expect(html).toContain('src="/api/werkgever/sites/media/mfoto0001.webp"');
    expect(html).toContain("<style>");
    expect(html).not.toMatch(/href="\/(?!api)/);
  });

  it("vult sjablonen met de bedrijfsnaam en plaats", () => {
    const pages = pagesFromTemplate(SECTOR_TEMPLATES[0]!, { ...company, naam: "Jansen Bouw", plaats: "Zwolle" }, id);
    expect(pages.map((p) => p.slug)).toEqual(["", "over-ons", "contact"]);
    expect(JSON.stringify(pages)).toContain("Jansen Bouw");
    expect(JSON.stringify(pages)).not.toContain("{bedrijf}");
    const zonderPlaats = JSON.stringify(pagesFromTemplate(SECTOR_TEMPLATES.find((t) => t.id === "bouw")!, { ...company, plaats: "" }, id));
    expect(zonderPlaats).toContain("in de regio.");
    expect(zonderPlaats).not.toContain("de regio en omgeving");
    expect(slugify("Bakkerij Ünal & Zn.")).toBe("bakkerij-unal-en-zn");
    expect(newBlock("galerij", "b1")).toMatchObject({ type: "galerij", props: { fotos: [] } });
  });
});

describe("afscherming van gehoste websites", () => {
  it("geeft /site/… een eigen herkomst zonder scripts, met formulieren alleen naar zichzelf", () => {
    const csp = buildContentSecurityPolicy({ dev: false, nonce: "abc", pathname: "/site/bakkerij/contact" });
    expect(csp).toMatch(/^sandbox allow-forms allow-popups allow-popups-to-escape-sandbox;/);
    expect(csp).not.toContain("allow-scripts");
    expect(csp).not.toContain("allow-same-origin");
    expect(csp).toContain("default-src 'none'");
    expect(csp).toMatch(/form-action 'self' https?:\/\/\S+/);
  });
});
