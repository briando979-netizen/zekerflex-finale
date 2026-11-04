import { describe, expect, it, vi } from "vitest";

// De stijl "beleving" (4 nov 2026): een gebouwde website precies zoals
// schwarzwald.zekerflex.com, zonder scripts. Opening in twee kolommen met schuine
// foto's, een band met het aanbod, labels boven de koppen, grote stappen, reviews
// op een donkere band, een afsluiter in de accentkleur. Premium blijft gelijk.

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const { renderPage, siteCss, premiumTokens, contrast, CREAM } = await import("@/lib/sites/render");
const bel = await import("@/lib/sites/beleving-render");
const { SCHWARZWALD_GROEN, SCHWARZWALD_ORANJE } = await import("@/lib/sites/proposal-site");
const { themeSchema, siteSaveSchema } = await import("@/lib/sites/schema");
const { SECTOR_TEMPLATES, pagesFromTemplate, newBlock } = await import("@/lib/sites/types");
type SiteDoc = import("@/lib/sites/types").SiteDoc;
type Block = import("@/lib/sites/types").Block;

const company = { naam: "Het Schwarzwald", kvk: "51448041", straat: "Markeloseweg 115", postcode: "7461 PB", plaats: "Rijssen", telefoon: "0548 51 85 05", email: "info@example.com" };
let n = 0;
const id = () => `b${(n++).toString(36).padStart(6, "0")}`;
const media = ["mhero00001", "mover00001", "mfoto00001", "mfoto00002"].map((m, i) => ({ id: m, file: `${m}.webp`, width: 1600, height: 1000, alt: `Foto ${i + 1}`, bron: "upload" as const }));

function site(stijl: "premium" | "beleving"): SiteDoc {
  const pages = pagesFromTemplate(SECTOR_TEMPLATES.find((t) => t.id === "horeca")!, company, id);
  const home = pages[0]!;
  const hero = home.blocks.find((b) => b.type === "hero");
  if (hero?.type === "hero") hero.props = { ...hero.props, kop: "Je beleeft 't hier.", foto: "mhero00001" };
  const diensten: Block = { ...newBlock("diensten", id()), props: { kop: "Kies je avontuur", items: [{ titel: "Buggy rijden", tekst: "150cc door zand en bos", foto: "mfoto00001" }, { titel: "Quad rijden", tekst: "Op een echte crossbaan" }, { titel: "Escaperoom", tekst: "Zes rooms" }] } } as Block;
  const galerij: Block = { ...newBlock("galerij", id()), props: { kop: "Sfeer", fotos: ["mover00001", "mfoto00002"] } } as Block;
  home.blocks.splice(1, 0, diensten, galerij);
  return {
    id: "sbeleving1",
    tenantId: "t1",
    slug: "schwarzwald",
    theme: { kleur: SCHWARZWALD_GROEN, accent: SCHWARZWALD_ORANJE, lettertype: "modern", hoeken: "rond", stijl },
    bedrijf: company,
    pages,
    media,
    liveBuild: null,
    builds: [],
    createdAt: "2026-11-04T12:00:00Z",
    updatedAt: "2026-11-04T12:00:00Z",
  };
}
const opts = { root: "/site/schwarzwald/", origin: "https://zekerflex.com", version: "v1", noindex: true };

describe("stijl beleving", () => {
  it("heeft de donkere tinten van de Schwarzwald-site, en lichte tekst blijft goed leesbaar", () => {
    const t = premiumTokens(SCHWARZWALD_GROEN, SCHWARZWALD_ORANJE);
    expect(t.night).toBe("#0a120e");
    expect(contrast(CREAM, t.night)).toBeGreaterThanOrEqual(7);
    // donkere tekst op hun oranje (knoppen, de band, de afsluiter): AA
    expect(contrast(t.night, SCHWARZWALD_ORANJE)).toBeGreaterThanOrEqual(4.5);
    expect(themeSchema.safeParse(site("beleving").theme).success).toBe(true);
  });

  it("zet de opening in twee kolommen met schuine foto's, badge en de band met het aanbod", () => {
    const s = site("beleving");
    const html = renderPage(s, s.pages[0]!, opts);
    expect(html).toContain('<section class="hero bel"><div class="wrap hero-grid met-foto">');
    expect(html).toContain('Je beleeft <span class="hl">&#39;t hier.</span></h1>');
    expect(html).toContain('<div class="collage"><div class="cf cf1"><img src="/site/schwarzwald/media/mhero00001.webp"');
    // de kleine foto's staan verderop nog eens: sier, zonder dubbele beschrijving
    expect(html).toMatch(/<div class="cf cf2"><img [^>]*alt=""/);
    expect(html).toContain('<div class="badge" aria-hidden="true">');
    expect(html).toContain("Het Schwarzwald · Rijssen · </textPath>");
    expect(html).toContain('<div class="ticker" aria-hidden="true"><div class="tk"><span>Buggy rijden</span><i>✦</i><span>Quad rijden</span>');
    expect(html).toContain('<a class="btn ghost" href="tel:0548518505">Bel 0548 51 85 05</a>');
    // geen balk met telefoon boven de kop en geen label boven de openingskop, zoals bij hen
    expect(html).not.toContain('class="topbar"');
    expect(html).not.toContain('class="eyebrow"');
  });

  it("geeft kaarten een pijl naar het contactformulier, labels boven de koppen en de afsluiter in de accentkleur", () => {
    const s = site("beleving");
    const html = renderPage(s, s.pages[0]!, opts);
    expect(html).toContain('<p class="kicker">Ons aanbod</p><h2>Kies je avontuur</h2>');
    expect(html).toContain('<div class="card bel"><div class="pic"><img');
    expect(html).toContain('<a class="pijl" href="/site/schwarzwald/contact" aria-label="Vraag naar Buggy rijden">→</a>');
    expect(html).toContain('<p class="kicker">Een indruk</p><h2>Sfeer</h2>');
    expect(html).toContain('<section class="band bel">');
    expect(html).toContain('<p class="band-acts"><a class="btn dark"');
    // het eerste blok na de opening staat op crème, zoals op hun site
    expect(html).toMatch(/<\/i><\/div><\/div><section><div class="wrap"><div class="sec-head">/);
    const reviews = s.pages[0]!.blocks.some((b) => b.type === "reviews");
    if (reviews) expect(html).toContain('<section class="rev">');
    const css = siteCss(s.theme);
    expect(css).toContain(".hero.bel h1{color:var(--cream)");
    expect(css).toContain("calc(100cqi / var(--n,6))");
    // niets beweegt vanzelf (WCAG 2.2.2)
    expect(css).not.toMatch(/animation:|@keyframes/);
  });

  it("laat premium precies zoals het was", () => {
    const s = site("premium");
    const html = renderPage(s, s.pages[0]!, opts);
    for (const bit of ["hero bel", "kicker", "ticker", "card bel", "band bel", 'class="rev"']) expect(html).not.toContain(bit);
    expect(html).toContain('<p class="eyebrow">Het Schwarzwald · Rijssen</p>');
    expect(siteCss(s.theme)).not.toContain(".hero.bel");
  });

  it("geeft fototegels, een donker paneel, een urenkaart, een schuine foto en een volle galerij van 12", () => {
    const s = site("beleving");
    const home = s.pages[0]!;
    const blok = <T extends Block["type"]>(type: T, props: object) => ({ ...newBlock(type, id()), props: { ...newBlock(type, "x").props, ...props } }) as Block;
    home.blocks = [
      home.blocks[0]!,
      blok("diensten", { kop: "Wat vieren jullie?", items: [{ titel: "Bedrijfsuitje", tekst: "Teambuilding.\n\nEn meer.", foto: "mfoto00001" }, { titel: "Trouwen", tekst: "Jullie dag.", foto: "mover00001" }] }),
      blok("usps", { kop: "Alles op één plek in Rijssen.", items: [{ titel: "Dertien activiteiten", tekst: "Binnen en buiten." }] }),
      blok("tekstFoto", { kop: "Over ons", tekst: "Al dertig jaar.", foto: "mfoto00002", fotoLinks: false }),
      blok("openingstijden", { kop: "Openingstijden", regels: [{ dag: "Woensdag t/m vrijdag", tijd: "13:00 – 22:30" }] }),
      blok("galerij", { kop: "Sfeer", fotos: Array.from({ length: 12 }, (_, i) => media[i % media.length]!.id) }),
      blok("contact", { kop: "Neem contact op", tekst: "Bel of mail.", formulier: true }),
    ];
    const html = renderPage(s, home, opts);
    expect(html).toContain('<div class="tegels"><div class="tegel"><img');
    // alleen de eerste alinea op de tegel, met een pijl naar het formulier
    expect(html).toContain('<h3>Bedrijfsuitje</h3><p>Teambuilding.</p></div><a class="pijl" href="#contact" aria-label="Vraag naar Bedrijfsuitje">→</a>');
    expect(html).toContain('<div class="paneel"><div class="paneel-in"><p class="kicker">Waarom wij</p><h2>Alles op één plek in <span class="hl">Rijssen.</span></h2><ul class="usps bel" role="list">');
    expect(html).toContain('<div class="lijst"><div class="lijst-f"><img');
    expect(html).toContain('<span class="lijst-tag" aria-hidden="true">Rijssen</span>');
    expect(html).toContain('<dl class="uren-kaart"><div><dt>Woensdag t/m vrijdag</dt><dd>13:00 – 22:30</dd></div></dl>');
    expect(html).toContain('<div class="gallery g4 bel">');
    // de accentkleur leest goed op night (hun oranje), dus het woord in het paneel wordt oranje
    expect(siteCss(s.theme)).toContain(".paneel h2 .hl{color:#FF5F1F}");
    // een donkere accentkleur leest niet op night: dan zon-geel
    expect(siteCss({ ...s.theme, accent: "#1D2B4F" })).toContain(".paneel h2 .hl{color:#FFD23F}");
  });

  it("toont een klantverhaal zonder sterren als sterren 0 is, in elke stijl", () => {
    for (const stijl of ["beleving", "premium"] as const) {
      const s = site(stijl);
      const reviews = { ...newBlock("reviews", id()), props: { kop: "Klantverhalen", items: [{ naam: "Anita", tekst: "Top dag.", sterren: 0 }, { naam: "Kees", tekst: "Super.", sterren: 4 }] } } as Block;
      s.pages[0]!.blocks.push(reviews);
      const html = renderPage(s, s.pages[0]!, opts);
      expect(html).toMatch(/<figure class="(rv|card)"><blockquote><p>Top dag\.<\/p><\/blockquote>/);
      expect(html).toContain('aria-label="4 van de 5 sterren">★★★★☆</div>');
    }
    const s = site("beleving");
    s.pages[0]!.blocks.push({ ...newBlock("reviews", id()), props: { kop: "K", items: [{ naam: "A", tekst: "B", sterren: 0 }] } } as Block);
    expect(siteSaveSchema.safeParse({ theme: s.theme, bedrijf: s.bedrijf, pages: s.pages }).success).toBe(true);
  });

  it("geeft een pagina zonder opening een donkere kop met de titel, en het eerste blok daaronder staat op crème", () => {
    const s = site("beleving");
    const over = s.pages.find((p) => p.slug === "over-ons")!;
    const html = renderPage(s, over, opts);
    expect(html).toContain(`<section class="pagekop"><div class="wrap"><p class="kicker">Het Schwarzwald</p><h1>${over.titel}</h1>`);
    expect(html).not.toContain('<h1 class="vh">');
    expect(html).toMatch(/<\/section><section><div class="wrap/);
    // de omschrijving staat er alleen als hij niet de tekst eronder herhaalt
    const eigen = { ...over, seoOmschrijving: "Familiebedrijf sinds 1987, midden in de bossen." };
    expect(renderPage(s, eigen, opts)).toContain("</h1><p>Familiebedrijf sinds 1987, midden in de bossen.</p></div></section>");
    const kopie = { ...over, seoOmschrijving: "Zelfde tekst als eronder.", blocks: [{ ...newBlock("tekst", id()), props: { kop: "Over", tekst: "Zelfde tekst als eronder. En nog meer." } } as Block] };
    expect(renderPage(s, kopie, opts)).toContain(`<h1>${over.titel}</h1></div></section>`);
    // premium houdt de onzichtbare kop
    const p = site("premium");
    expect(renderPage(p, p.pages.find((x) => x.slug === "over-ons")!, opts)).toContain(`<h1 class="vh">${over.titel}</h1>`);
  });

  it("knipt de kop en de badge netjes", () => {
    expect(bel.splitKop("Schildersbedrijf De Vries")).toEqual({ rest: "Schildersbedrijf", hl: "De Vries" });
    expect(bel.splitKop("Ambachtelijk brood, elke ochtend vers")).toEqual({ rest: "Ambachtelijk brood, elke ochtend", hl: "vers" });
    expect(bel.splitKop("Kompas")).toEqual({ rest: "Kompas", hl: "" });
    // een lang woord maakt de kop kleiner, zodat hij op een telefoon niet uit beeld loopt
    expect(bel.kopMaat("Schildersbedrijf De Vries")).toBeCloseTo(16 * 0.56, 2);
    expect(bel.kopMaat("Je beleeft")).toBeCloseTo(7 * 0.56, 2);
    expect(bel.badgeTekst({ ...company, naam: "Installatiebedrijf Van den Berg en Zonen", plaats: "Hengelo" })).toBe("Installatiebedrijf Van den… · ");
    expect(bel.kickerVoor({ ...newBlock("contact", "x"), props: { kop: "Neem contact op", tekst: "", formulier: true } } as Block, company)).toBe("");
  });
});
