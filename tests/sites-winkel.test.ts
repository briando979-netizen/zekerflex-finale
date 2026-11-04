import { describe, expect, it } from "vitest";
import { LEGE_INVOER, berekenBestelling, categorieen, euro, isUitverkocht, leesBestelForm, productSlug, verlaagVoorraad, type BestelInvoer } from "@/lib/sites/winkel";
import { renderPage, renderSitemap, renderWinkelPagina, siteCss } from "@/lib/sites/render";
import { siteSaveSchema, winkelSchema } from "@/lib/sites/schema";
import { demoWinkel } from "@/lib/sites/demo";
import { LEGE_WINKEL, newBlock, type SiteDoc, type SiteProduct, type Winkel } from "@/lib/sites/types";

// De winkel van een klantsite: rekenen met de prijzen van de site, controleren wat
// een bezoeker invult, en HTML zonder scripts met alles geëscaped.

const product = (over: Partial<SiteProduct> = {}): SiteProduct => ({
  id: "paaaaaaa1",
  naam: "Desembrood",
  slug: "desembrood",
  prijsCents: 450,
  korteTekst: "Met een krokante korst",
  omschrijving: "Twee dagen gerezen.\n\nMet meel van de molen.",
  fotos: [],
  categorie: "Brood",
  zichtbaar: true,
  uitverkocht: false,
  ...over,
});

const winkel = (over: Partial<Winkel> = {}): Winkel => ({
  ...LEGE_WINKEL,
  producten: [product(), product({ id: "pbbbbbbb2", naam: "Croissant", slug: "croissant", prijsCents: 195, categorie: "Gebak" }), product({ id: "pccccccc3", naam: "Taart", slug: "taart", prijsCents: 2450, categorie: "Gebak", uitverkocht: true })],
  levering: { afhalen: true, bezorgen: true, bezorgkostenCents: 395, gratisVanafCents: 2500 },
  ...over,
});

const invoer = (over: Partial<BestelInvoer> = {}): BestelInvoer => ({
  aantallen: { paaaaaaa1: 2 },
  keuzes: {},
  levering: "afhalen",
  naam: "Sanne de Vries",
  email: "sanne@example.com",
  telefoon: "06 12345678",
  straat: "",
  postcode: "",
  plaats: "",
  opmerking: "",
  ...over,
});

describe("winkel: rekenen en controleren", () => {
  it("schrijft bedragen op zijn Nederlands", () => {
    expect(euro(450)).toBe("€ 4,50");
    expect(euro(125000)).toBe("€ 1.250,00");
    expect(euro(0)).toBe("€ 0,00");
  });

  it("maakt unieke productadressen en houdt de volgorde van categorieën aan", () => {
    expect(productSlug("Desembrood wit", [])).toBe("desembrood-wit");
    expect(productSlug("Desembrood wit", ["desembrood-wit", "desembrood-wit-2"])).toBe("desembrood-wit-3");
    expect(categorieen(winkel().producten)).toEqual(["Brood", "Gebak"]);
  });

  it("rekent met de prijzen van de site en telt bezorgkosten tot het gratis-bedrag", () => {
    const afhalen = berekenBestelling(winkel(), invoer());
    expect(afhalen.fouten).toEqual([]);
    expect(afhalen.concept?.totaalCents).toBe(900);
    const bezorgen = berekenBestelling(winkel(), invoer({ levering: "bezorgen", straat: "Dorpsstraat 1", postcode: "1234 AB", plaats: "Zonnedorp" }));
    expect(bezorgen.concept?.bezorgkostenCents).toBe(395);
    expect(bezorgen.concept?.totaalCents).toBe(1295);
    const veel = berekenBestelling(winkel(), invoer({ aantallen: { paaaaaaa1: 6 }, levering: "bezorgen", straat: "Dorpsstraat 1", postcode: "1234 AB", plaats: "Zonnedorp" }));
    expect(veel.concept?.bezorgkostenCents).toBe(0);
  });

  it("weigert lege of onvolledige bestellingen met uitleg, en uitverkochte producten", () => {
    expect(berekenBestelling(winkel(), invoer({ aantallen: {} })).fouten).toContain("Kies bij minstens één product hoeveel je wilt bestellen.");
    expect(berekenBestelling(winkel(), invoer({ email: "geen-mail" })).fouten).toContain("Vul een geldig e-mailadres in.");
    expect(berekenBestelling(winkel(), invoer({ levering: "bezorgen" })).fouten[0]).toMatch(/adres/);
    expect(berekenBestelling(winkel(), invoer({ aantallen: { pccccccc3: 1 } })).fouten).toEqual(["Taart is uitverkocht."]);
    expect(berekenBestelling(winkel({ bestellen: false }), invoer()).fouten[0]).toMatch(/staat .* uit/);
  });

  it("negeert onbekende producten en verborgen producten, en begrenst het aantal", () => {
    const w = winkel({ producten: [product(), product({ id: "pddddddd4", slug: "geheim", zichtbaar: false })] });
    const r = berekenBestelling(w, invoer({ aantallen: { paaaaaaa1: 1, pddddddd4: 3, pzzzzzzz9: 5 } }));
    expect(r.concept?.regels.map((x) => x.productId)).toEqual(["paaaaaaa1"]);
    const form = new FormData();
    form.set("n_paaaaaaa1", "500");
    form.set("n_bestaatniet", "2");
    form.set("levering", "iets");
    expect(leesBestelForm(form).aantallen).toEqual({ paaaaaaa1: 99 });
    expect(leesBestelForm(form).levering).toBe("afhalen");
  });
});

describe("winkel: maten, kleuren en voorraad", () => {
  const hoodie = product({ id: "phoodie001", naam: "Hoodie", slug: "hoodie", prijsCents: 4995, opties: [{ naam: "Maat", waarden: ["S", "M", "L"] }, { naam: "Kleur", waarden: ["Zwart", "Wit"] }], voorraad: 3 });
  const w = winkel({ producten: [hoodie, product()] });

  it("vraagt om elke keuze en zet de variant in de bestelregel", () => {
    expect(berekenBestelling(w, invoer({ aantallen: { phoodie001: 1 } })).fouten).toEqual(["Kies maat bij Hoodie."]);
    expect(berekenBestelling(w, invoer({ aantallen: { phoodie001: 1 }, keuzes: { phoodie001: ["M", "Paars"] } })).fouten).toEqual(["Kies kleur bij Hoodie."]);
    const r = berekenBestelling(w, invoer({ aantallen: { phoodie001: 2 }, keuzes: { phoodie001: ["M", "Zwart"] } }));
    expect(r.concept?.regels[0]).toMatchObject({ naam: "Hoodie (M, Zwart)", variant: "M, Zwart", totaalCents: 9990 });
  });

  it("bestelt nooit meer dan er op voorraad is, en lege voorraad is uitverkocht", () => {
    expect(berekenBestelling(w, invoer({ aantallen: { phoodie001: 4 }, keuzes: { phoodie001: ["S", "Wit"] } })).fouten).toEqual(["Van Hoodie zijn er nog 3."]);
    const op = winkel({ producten: [{ ...hoodie, voorraad: 0 }] });
    expect(berekenBestelling(op, invoer({ aantallen: { phoodie001: 1 }, keuzes: { phoodie001: ["S", "Wit"] } })).fouten).toEqual(["Hoodie is uitverkocht."]);
    expect(isUitverkocht({ uitverkocht: false, voorraad: 0 })).toBe(true);
    expect(isUitverkocht({ uitverkocht: false, voorraad: null })).toBe(false);
  });

  it("haalt na een bestelling alleen bijgehouden voorraad omlaag, nooit onder nul", () => {
    const na = verlaagVoorraad(w, [{ productId: "phoodie001", aantal: 2 }, { productId: "paaaaaaa1", aantal: 5 }, { productId: "phoodie001", aantal: 5 }]);
    expect(na.producten.find((p) => p.id === "phoodie001")?.voorraad).toBe(0);
    expect(na.producten.find((p) => p.id === "paaaaaaa1")?.voorraad).toBeUndefined();
  });

  it("leest de keuzes uit het formulier en zet ze terug op de controlepagina", () => {
    const form = new FormData();
    form.set("n_phoodie001", "1");
    form.set("k_phoodie001_0", "L");
    form.set("k_phoodie001_1", "Wit");
    form.set("k_phoodie001_7", "fout");
    const i = { ...invoer(), ...leesBestelForm(form), naam: "Sanne", email: "sanne@example.com", telefoon: "0612345678" };
    expect(i.keuzes).toEqual({ phoodie001: ["L", "Wit"] });
    const c = berekenBestelling(w, i).concept!;
    const html = renderWinkelPagina(site(w), { soort: "controle", concept: c }, opts) ?? "";
    expect(html).toContain('name="k_phoodie001_0" value="L"');
    expect(html).toContain("1 × Hoodie (L, Wit)");
  });

  it("toont keuzelijsten op de productpagina en 'Nog 3 op voorraad'", () => {
    const html = renderWinkelPagina(site(w), { soort: "product", slug: "hoodie" }, opts) ?? "";
    expect(html).toContain('<select id="o0" name="o0">');
    expect(html).toContain('<option value="Zwart">Zwart</option>');
    expect(html).toContain("Nog 3 op voorraad");
    expect(html).toContain('max="3"');
    const bestel = renderWinkelPagina(site(w), { soort: "bestellen", invoer: { ...LEGE_INVOER, aantallen: { phoodie001: 1 }, keuzes: { phoodie001: ["M", ""] } } }, opts) ?? "";
    expect(bestel).toContain('name="k_phoodie001_0"');
    expect(bestel).toContain('<option value="M" selected>M</option>');
  });
});

const site = (w: Winkel): Pick<SiteDoc, "pages" | "media" | "theme" | "bedrijf" | "voorbeeld" | "voorstel" | "winkel"> => ({
  pages: [{ id: "home", slug: "", titel: "Home", seoTitel: "", seoOmschrijving: "", blocks: [{ ...newBlock("producten", "b1") }] }],
  media: [],
  theme: { kleur: "#3B2A1E", accent: "#D4A24C", lettertype: "klassiek", hoeken: "rond", stijl: "premium" },
  bedrijf: { naam: "Bakkerij <Jansen>", kvk: "", straat: "", postcode: "", plaats: "Zonnedorp", telefoon: "", email: "" },
  winkel: w,
});
const opts = { root: "/site/bakker/", origin: "https://zekerflex.com" };

describe("winkel: weergave", () => {
  it("toont productkaarten als één link, met prijs en 'Uitverkocht' in tekst, zonder scripts", () => {
    const html = renderPage(site(winkel()), site(winkel()).pages[0]!, opts);
    expect(html).toContain('<a class="pcard" href="/site/bakker/p/desembrood">');
    expect(html).toContain("€ 4,50");
    expect(html).toContain('<span class="psold">Uitverkocht</span>');
    expect(html).toContain("Bakkerij &lt;Jansen&gt;");
    expect(html).not.toMatch(/<script(?! type="application\/ld\+json")/);
  });

  it("geeft een productpagina met bestelknop en Product-gegevens voor zoekmachines", () => {
    const html = renderWinkelPagina(site(winkel()), { soort: "product", slug: "desembrood" }, opts) ?? "";
    expect(html).toContain("<h1>Desembrood</h1>");
    expect(html).toContain('action="/site/bakker/bestellen"');
    expect(html).toContain('"@type":"Product"');
    expect(html).toContain('<link rel="canonical" href="https://zekerflex.com/site/bakker/p/desembrood">');
    expect(renderWinkelPagina(site(winkel()), { soort: "product", slug: "bestaat-niet" }, opts)).toBeNull();
  });

  it("laat in een voorbeeldwinkel niets bestellen", () => {
    const html = renderWinkelPagina({ ...site(winkel()), voorbeeld: true }, { soort: "bestellen" }, opts) ?? "";
    expect(html).toContain('action="#"');
    expect(html).toContain("bestellen kan hier niet");
  });

  it("zet de winkel en de producten in de sitemap", () => {
    const xml = renderSitemap(site(winkel()), opts);
    expect(xml).toContain("https://zekerflex.com/site/bakker/winkel");
    expect(xml).toContain("https://zekerflex.com/site/bakker/p/croissant");
  });

  it("geeft een 4K-foto ook een kleine kopie voor telefoons (srcset)", () => {
    const s = { ...site(winkel({ producten: [product({ fotos: ["mfoto000001"] })] })), media: [{ id: "mfoto000001", file: "mfoto000001.webp", width: 3840, height: 2560, alt: "Brood", bron: "upload" as const, klein: { width: 1600, height: 1067 } }] };
    const html = renderPage(s, s.pages[0]!, opts);
    expect(html).toContain('srcset="/site/bakker/media/mfoto000001-k.webp 1600w, /site/bakker/media/mfoto000001.webp 3840w"');
    expect(html).toContain('width="3840" height="2560"');
  });

  it("geeft de premium-winkel de prijs in de donkere accentkleur", () => {
    expect(siteCss(site(winkel()).theme)).toContain(".pprice{color:var(--a-d)}");
  });
});

describe("winkel: wat de bouwer mag opslaan", () => {
  const basis = { theme: site(winkel()).theme, bedrijf: { naam: "Bakker", kvk: "", straat: "", postcode: "", plaats: "", telefoon: "", email: "" }, pages: site(winkel()).pages };
  it("accepteert een winkel en weigert dubbele adressen of een winkel zonder levering", () => {
    expect(siteSaveSchema.safeParse({ ...basis, winkel: winkel() }).success).toBe(true);
    const dubbel = winkel({ producten: [product(), product({ id: "pbbbbbbb2" })] });
    expect(siteSaveSchema.safeParse({ ...basis, winkel: dubbel }).success).toBe(false);
    expect(siteSaveSchema.safeParse({ ...basis, winkel: winkel({ levering: { afhalen: false, bezorgen: false, bezorgkostenCents: 0, gratisVanafCents: null } }) }).success).toBe(false);
  });

  it("de voorbeeldwinkel van Bakkerij Jansen voldoet aan dezelfde regels", () => {
    const w = demoWinkel(() => "mfoto000001");
    expect(winkelSchema.safeParse(w).success).toBe(true);
    expect(w.producten.length).toBeGreaterThanOrEqual(8);
    expect(w.producten.some((p) => p.uitverkocht) && w.producten.some((p) => p.oudePrijsCents)).toBe(true);
  });

  it("houdt de adressen van de winkel vrij voor eigen pagina's", () => {
    const pages = [...basis.pages, { id: "w", slug: "winkel", titel: "Winkel", seoTitel: "", seoOmschrijving: "", blocks: [] }];
    expect(siteSaveSchema.safeParse({ ...basis, pages }).success).toBe(false);
  });
});
