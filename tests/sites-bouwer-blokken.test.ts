import { describe, expect, it } from "vitest";
import { renderPage, renderSitemap, siteCss, type RenderOptions } from "@/lib/sites/render";
import { siteSaveSchema } from "@/lib/sites/schema";
import { BLOCK_LABELS, SECTOR_TEMPLATES, newBlock, pagesFromTemplate, type Block, type BlockType, type Company, type SiteDoc } from "@/lib/sites/types";
import { EXTRA_TYPES, kaartAdres, puntenLijst, routeLink } from "@/lib/sites/extra-blokken-render";

// De negen blokken die de bouwer erbij kreeg, en de instellingen die elk blok heeft
// (verbergen, ruimte, achtergrond, uitlijning). Bestaande sites mogen er niets van merken.

const company: Company = { naam: "Bakkerij Jansen", kvk: "12345678", straat: "Dorpsstraat 1", postcode: "1234 AB", plaats: "Rijssen", telefoon: "0548-123456", email: "info@bakkerij.nl" };
let n = 0;
const id = () => `b${(n++).toString(36).padStart(6, "0")}`;
const FOTO = "mfoto0001";

function site(stijl?: "beleving" | "premium" | "luxe" | "standaard"): SiteDoc {
  const template = SECTOR_TEMPLATES.find((t) => t.id === "algemeen")!;
  return {
    id: "sabcdef12",
    tenantId: "t1",
    slug: "bakkerij",
    theme: { kleur: "#0E5C4A", accent: "#F2B544", lettertype: "modern", hoeken: "rond", ...(stijl ? { stijl } : {}) },
    bedrijf: company,
    pages: pagesFromTemplate(template, company, id),
    media: [{ id: FOTO, file: "mfoto0001.webp", width: 1600, height: 1067, alt: "Het team voor de winkel", bron: "upload" }],
    liveBuild: null,
    builds: [],
    createdAt: "2026-11-06T08:00:00Z",
    updatedAt: "2026-11-06T08:00:00Z",
  };
}
const opts: RenderOptions = { root: "/site/bakkerij/", origin: "https://zekerflex.com", version: "v1", noindex: true };

function metBlok(s: SiteDoc, b: Block): string {
  const page = { ...s.pages[2]!, blocks: [b] };
  return renderPage({ ...s, pages: [s.pages[0]!, s.pages[1]!, page] }, page, opts);
}

describe("nieuwe blokken: standaardinhoud en schema", () => {
  it("heeft voor elk type een naam en een startblok dat het schema accepteert", () => {
    const s = site();
    for (const t of EXTRA_TYPES) {
      expect(BLOCK_LABELS[t]).toBeTruthy();
      const b = newBlock(t as BlockType, id());
      expect(b.type).toBe(t);
      const page = { ...s.pages[0]!, blocks: [b] };
      const res = siteSaveSchema.safeParse({ theme: s.theme, bedrijf: s.bedrijf, pages: [page] });
      expect(res.success, `${t}: ${JSON.stringify(res.success ? "" : res.error.issues)}`).toBe(true);
    }
  });

  it("weigert een video- of routelink die niet https is", () => {
    const s = site();
    const video = { ...newBlock("video", id()), props: { kop: "", tekst: "", foto: null, knop: "Bekijk", link: "http://x.nl/v" } };
    const kaart = { ...newBlock("kaart", id()), props: { kop: "", tekst: "", adres: "", routeLink: "javascript:alert(1)", knop: "" } };
    for (const b of [video, kaart]) {
      const res = siteSaveSchema.safeParse({ theme: s.theme, bedrijf: s.bedrijf, pages: [{ ...s.pages[0]!, blocks: [b] }] });
      expect(res.success).toBe(false);
    }
  });

  it("neemt de blokinstellingen en het menu van een pagina mee", () => {
    const s = site();
    const b = { ...newBlock("tekst", id()), verborgen: true, ruimte: "groot", achtergrond: "merk", uitlijning: "midden" };
    const res = siteSaveSchema.safeParse({ theme: s.theme, bedrijf: s.bedrijf, pages: [{ ...s.pages[0]!, menu: false, menuLabel: "Start", blocks: [b] }] });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.pages[0]).toMatchObject({ menu: false, menuLabel: "Start", blocks: [{ verborgen: true, ruimte: "groot", achtergrond: "merk", uitlijning: "midden" }] });
    const fout = siteSaveSchema.safeParse({ theme: s.theme, bedrijf: s.bedrijf, pages: [{ ...s.pages[0]!, blocks: [{ ...b, achtergrond: "#ff0000" }] }] });
    expect(fout.success).toBe(false);
  });
});

describe("nieuwe blokken: weergave", () => {
  it("toont pakketten met prijs, opsomming en een uitgelicht label", () => {
    const html = metBlok(site(), newBlock("prijzen", id()));
    expect(html).toContain('class="x-prijzen"');
    expect(html).toContain("Meest gekozen");
    expect(html).toContain("<strong>€ 49</strong>");
    expect(html).toContain("<li>Tweede punt</li>");
    expect(html).toContain('href="/site/bakkerij/contact"');
  });

  it("zet de naam van een teamlid als alt-tekst van de foto", () => {
    const b = { ...newBlock("team", id()), props: { kop: "Team", tekst: "", items: [{ naam: "Jan <b>", functie: "Bakker", foto: FOTO }] } } as Block;
    const html = metBlok(site(), b);
    expect(html).toContain('alt="Jan &lt;b&gt;"');
    expect(html).toContain("<p>Bakker</p>");
  });

  it("toont cijfers en logo's, en niets zonder foto's", () => {
    const html = metBlok(site(), newBlock("cijfers", id()));
    expect(html).toContain("<strong>1.200</strong><span>tevreden klanten</span>");
    expect(metBlok(site(), newBlock("logos", id()))).not.toContain("x-logos");
    const logos = { ...newBlock("logos", id()), props: { kop: "", fotos: [FOTO] } } as Block;
    expect(metBlok(site(), logos)).toContain('class="x-logos"');
  });

  it("maakt van een video een eigen foto met een knop, zonder iframe of script", () => {
    const b = { ...newBlock("video", id()), props: { kop: "Kijk", tekst: "", foto: FOTO, knop: "Bekijk de video", link: "https://www.youtube.com/watch?v=abc" } } as Block;
    const html = metBlok(site(), b);
    expect(html).toContain('href="https://www.youtube.com/watch?v=abc"');
    expect(html).toContain("Bekijk de video");
    expect(html).not.toMatch(/<iframe|<video|<embed|<object/i);
    expect(html).not.toContain('<script src');
  });

  it("toont een adres met routeknop, zonder ingebedde kaart", () => {
    const html = metBlok(site(), newBlock("kaart", id()));
    // het adres komt van het bedrijf
    expect(html).toContain("Dorpsstraat 1<br>1234 AB Rijssen");
    expect(html).toContain("https://www.google.com/maps/search/?api=1&amp;query=Dorpsstraat%201%2C%201234%20AB%20Rijssen");
    expect(html).not.toMatch(/<iframe/i);
    expect(kaartAdres("  Kerkstraat 2 ", company)).toBe("Kerkstraat 2");
    expect(routeLink("https://maps.example/route", "x")).toBe("https://maps.example/route");
    expect(routeLink("javascript:x", "a b")).toContain("query=a%20b");
  });

  it("toont een afbeelding met bijschrift, een scheiding en een rij knoppen", () => {
    const afb = { ...newBlock("afbeelding", id()), props: { foto: FOTO, bijschrift: "Onze winkel", breed: true } } as Block;
    expect(metBlok(site(), afb)).toContain("<figcaption>Onze winkel</figcaption>");
    expect(metBlok(site(), newBlock("afbeelding", id()))).not.toContain("x-afb");
    const lijn = { ...newBlock("scheiding", id()), props: { vorm: "lijn", hoogte: "groot" } } as Block;
    expect(metBlok(site(), lijn)).toContain('class="x-scheiding x-groot"');
    const knoppen = metBlok(site(), newBlock("knoppen", id()));
    expect(knoppen).toContain('<a class="btn" href="/site/bakkerij/contact">Neem contact op</a>');
    expect(knoppen).toContain('class="btn x-lijn"');
  });

  it("werkt ook in de stijl beleving, met een label boven de kop", () => {
    const logos = { ...newBlock("logos", id()), props: { kop: "Zij gingen je voor", fotos: [FOTO] } } as Block;
    expect(metBlok(site("beleving"), logos)).toContain('<p class="kicker">Vertrouwd door</p><h2>Zij gingen je voor</h2>');
    // een kop die het label al zegt krijgt het niet nog eens
    expect(metBlok(site("beleving"), newBlock("prijzen", id()))).not.toContain('<p class="kicker">Prijzen</p>');
  });
});

describe("blokinstellingen", () => {
  it("laat een blok zonder instellingen precies zoals het was", () => {
    const b = newBlock("tekst", id());
    const kaal = metBlok(site(), b);
    expect(kaal).not.toContain("zf-r-");
    expect(kaal).not.toContain("zf-bg-");
    expect(kaal).not.toContain("zf-u-");
    expect(metBlok(site(), { ...b, ruimte: "normaal", achtergrond: "geen", uitlijning: "links" })).toBe(kaal);
  });

  it("zet ruimte, achtergrond en uitlijning in een omhulsel", () => {
    const b = { ...newBlock("tekst", id()), ruimte: "groot", achtergrond: "zacht", uitlijning: "midden" } as Block;
    expect(metBlok(site(), b)).toContain('<div class="zf-r-groot zf-bg-zacht zf-u-midden"><section');
  });

  it("laat een verborgen blok weg van de pagina, maar bewaart het", () => {
    const b = { ...newBlock("tekst", id()), props: { kop: "Geheime kop", tekst: "x" }, verborgen: true } as Block;
    const s = site();
    const html = metBlok(s, b);
    expect(html).not.toContain("Geheime kop");
    const zicht = metBlok(s, { ...b, verborgen: false } as Block);
    expect(zicht).toContain("Geheime kop");
  });

  it("laat een pagina buiten het menu, onder de naam die de klant koos", () => {
    const s = site();
    s.pages[1] = { ...s.pages[1]!, menu: false };
    s.pages[2] = { ...s.pages[2]!, menuLabel: "Neem contact op" };
    const html = renderPage(s, s.pages[0]!, opts);
    const nav = html.split('<nav class="desk"')[1]!.split("</nav>")[0]!;
    expect(nav).not.toContain("Over ons");
    expect(nav).toContain(">Neem contact op</a>");
    // de pagina bestaat nog: sitemap en linkcontrole
    expect(renderSitemap(s, opts)).toContain("/site/bakkerij/over-ons");
  });

  it("voegt aan het stylesheet alleen nieuwe klassen toe", () => {
    const css = siteCss(site().theme);
    expect(css).toContain(".x-prijzen{");
    expect(css).toContain("div.zf-bg-merk>section{");
  });
});
