import { describe, expect, it } from "vitest";
import { galleryClass, renderPage, renderRobots, renderSitemap, renderSystemPage, safeHref, siteCss, socialName, textOn, vacancyWhen, waNumber, type RenderOptions } from "@/lib/sites/render";
import { siteSaveSchema } from "@/lib/sites/schema";
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

  it("zonder foto op de pagina is het logo de preview bij delen", () => {
    const zonder = site();
    const contact = zonder.pages.find((p) => p.slug === "contact")!;
    expect(renderPage(zonder, contact, opts)).not.toContain('property="og:image"');
    const metLogo = site({ theme: { ...zonder.theme, logo: "mfoto0001" } });
    expect(renderPage(metLogo, metLogo.pages.find((p) => p.slug === "contact")!, opts)).toContain('<meta property="og:image" content="https://zekerflex.com/site/bakkerij/media/mfoto0001.webp">');
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

describe("fotogalerij", () => {
  it("vult altijd hele rijen; vijf foto's krijgen een grote eerste foto", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map(galleryClass)).toEqual([
      "gallery",
      "gallery g2",
      "gallery g3",
      "gallery g4",
      "gallery bento",
      "gallery g3",
      "gallery",
      "gallery g4",
      "gallery g3",
    ]);
    expect(siteCss(site().theme)).toContain(".gallery.bento img:first-child{grid-column:span 2;grid-row:span 2}");
  });
});

describe("luxe stijl, logo, WhatsApp en sociale media", () => {
  it("de luxe stijl komt alleen bij stijl luxe, met boekletters bij klassiek", () => {
    const base = site().theme;
    expect(siteCss(base)).not.toContain("hero.photo::after");
    const luxe = siteCss({ ...base, stijl: "luxe", lettertype: "klassiek" });
    expect(luxe).toContain(".hero.photo::after");
    expect(luxe).toContain("Palatino");
    expect(siteCss({ ...base, stijl: "luxe", lettertype: "modern" })).not.toContain("Palatino");
  });

  it("tekst met foto zonder foto krijgt de leesbreedte, geen halve rij", () => {
    const s = site();
    const html = renderPage(s, s.pages[0]!, opts);
    expect(html).toContain('<div class="wrap narrow"><h2>Over Bakkerij');
    expect(html).not.toContain('<div class="wrap split"><div><h2>Over Bakkerij');
    const hero = s.pages[0]!.blocks.find((b) => b.type === "tekstFoto")!;
    if (hero.type === "tekstFoto") hero.props.foto = "mfoto0001";
    expect(renderPage(s, s.pages[0]!, opts)).toContain('<div class="wrap split"><div><h2>Over Bakkerij');
  });

  it("toont een eigen foto als logo, en anders de naam", () => {
    const s = site({ theme: { ...site().theme, logo: "mfoto0001" } });
    const html = renderPage(s, s.pages[0]!, opts);
    expect(html).toMatch(/<a class="logo" href="\/site\/bakkerij"><img src="\/site\/bakkerij\/media\/mfoto0001\.webp" alt="Bakkerij &lt;script&gt;/);
    const vreemd = site({ theme: { ...site().theme, logo: "monbekend1" } });
    expect(renderPage(vreemd, vreemd.pages[0]!, opts)).toContain('<a class="logo" href="/site/bakkerij">Bakkerij &lt;script&gt;');
  });

  it("zet een WhatsApp-knop neer voor een echt mobiel nummer", () => {
    expect(["06 12345678", "+31 6 1234 5678", "0031612345678", "06-12"].map(waNumber)).toEqual(["31612345678", "31612345678", "31612345678", null]);
    const s = site({ bedrijf: { ...company, whatsapp: "06 12345678" } });
    const contact = s.pages.find((p) => p.slug === "contact")!;
    const html = renderPage(s, contact, opts);
    expect(html).toContain('<a class="wa" href="https://wa.me/31612345678" rel="noopener">');
    expect(html).toContain('WhatsApp: <a href="https://wa.me/31612345678"');
    expect(renderPage(site(), contact, opts)).not.toContain('class="wa"');
  });

  it("laat alleen veilige links naar sociale media door, met een nette naam", () => {
    const s = site({ bedrijf: { ...company, socials: ["https://www.instagram.com/bakkerij", "javascript:alert(1)", "https://nl.linkedin.com/company/bakkerij"] } });
    const html = renderPage(s, s.pages[0]!, opts);
    expect(html).toContain('<p class="socials"><a href="https://www.instagram.com/bakkerij" rel="noopener me">Instagram</a><a href="https://nl.linkedin.com/company/bakkerij" rel="noopener me">LinkedIn</a></p>');
    expect(html).not.toContain("javascript:");
    expect(socialName("https://x.com/bakker")).toBe("X");
    expect(socialName("https://www.bakkerij.nl/blog")).toBe("bakkerij.nl");
  });
});

describe("vacatureblok: open diensten van het bedrijf", () => {
  const withBlock = (aantal = 6) => {
    const s = site();
    s.pages[0]!.blocks.push(newBlock("vacatures", "bvac00001"));
    const b = s.pages[0]!.blocks.at(-1)!;
    if (b.type === "vacatures") b.props.aantal = aantal;
    return s;
  };
  const live = [
    { id: "shift1", titel: 'Kok <b>"spoed"</b>', start: "2026-11-14T16:00:00.000Z", eind: "2026-11-14T22:00:00.000Z", plaats: "Rijssen", uurloonCents: 1875, url: "https://zekerflex.com/klussen/shift1" },
    { id: "shift2", titel: "Afwasser", start: "2026-11-15T09:00:00.000Z", eind: "2026-11-15T13:30:00.000Z", plaats: "Rijssen", uurloonCents: 1450, url: "https://zekerflex.com/klussen/shift2" },
  ];

  it("toont live de echte diensten, in Nederlandse tijd, met een link naar ZekerFlex", () => {
    const s = withBlock();
    const html = renderPage(s, s.pages[0]!, { ...opts, vacatures: live });
    expect(html).toContain("Kok &lt;b&gt;&quot;spoed&quot;&lt;/b&gt;");
    expect(html).toContain("za 14 nov · 17:00 – 23:00"); // 16:00 UTC is 17:00 in Nederland in november
    expect(html).toContain("Rijssen · € 18,75 per uur");
    expect(html).toContain('href="https://zekerflex.com/klussen/shift1" rel="noopener">Reageer via ZekerFlex</a>');
    expect(html).not.toContain("(voorbeeld)");
    expect(renderPage(withBlock(1), withBlock(1).pages[0]!, { ...opts, vacatures: live })).not.toContain("Afwasser");
  });

  it("zonder live gegevens (bouwer, voorbeeld, voorstel) twee gemarkeerde voorbeelden; zonder open diensten een nette melding", () => {
    const s = withBlock();
    const preview = renderPage(s, s.pages[0]!, opts);
    expect(preview).toContain("Medewerker bediening (voorbeeld)");
    expect(preview).toContain("op je website staan hier vanzelf je open diensten");
    expect(preview).toContain('<a class="btn" href="#">Reageer via ZekerFlex</a>');
    const empty = renderPage(s, s.pages[0]!, { ...opts, vacatures: [] });
    expect(empty).toContain("Er staan nu geen diensten open");
    expect(empty).toContain('href="/site/bakkerij/contact"');
    expect(vacancyWhen({ start: "2026-07-04T08:00:00.000Z", eind: "2026-07-04T16:00:00.000Z" })).toBe("za 4 jul · 10:00 – 18:00"); // zomertijd
  });

  it("de bouwer mag 1 tot 12 diensten tonen", () => {
    const s = withBlock();
    const ok = siteSaveSchema.safeParse({ theme: s.theme, bedrijf: s.bedrijf, pages: s.pages });
    expect(ok.success).toBe(true);
    const te = withBlock(13);
    expect(siteSaveSchema.safeParse({ theme: te.theme, bedrijf: te.bedrijf, pages: te.pages }).success).toBe(false);
  });
});

describe("ontwerpvoorstel voor een bedrijf", () => {
  const voorstel = { officieel: "bakkerij.nl", verloopt: "2026-12-03T10:00:00.000Z" };

  it("zegt op elke pagina dat het niet de officiële website is, en verwijst naar die site", () => {
    const s = site({ voorstel });
    const html = renderPage(s, s.pages[0]!, { ...opts, noindex: false });
    expect(html).toContain("Ontwerpvoorstel van ZekerFlex voor Bakkerij &lt;script&gt;");
    expect(html).toContain('die staat op <a href="https://bakkerij.nl" rel="noopener">bakkerij.nl</a>');
    expect(html).toContain('<meta name="robots" content="noindex">'); // ook als de plek zelf wel geïndexeerd mag worden
    expect(html).not.toContain("application/ld+json");
    expect(renderSystemPage(s, "privacy", opts)).toContain("Ontwerpvoorstel van ZekerFlex");
  });

  it("het formulier staat uit en verstuurt niets", () => {
    const s = site({ voorstel });
    const contact = s.pages.find((p) => p.slug === "contact")!;
    const html = renderPage(s, contact, opts);
    expect(html).toContain('<form class="contact" method="post" action="#">');
    expect(html).toMatch(/<button class="btn" type="submit" disabled>/);
    expect(html).toContain("Dit is een ontwerpvoorstel:");
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
