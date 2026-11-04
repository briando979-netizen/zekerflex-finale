import { describe, expect, it } from "vitest";
import { MAX_VARIANTEN, leesMand, mandCookie, mandMetProducten, mandNaarInvoer, schrijfMand, voegToe, zetAantal, type MandRegel } from "@/lib/sites/mand";
import { GEEN_FILTER, actieveFilters, filterProducten, filterQuery, leesFilter } from "@/lib/sites/winkel-filter";
import { berekenBestelling, leesBestelForm } from "@/lib/sites/winkel";
import { renderWinkelPagina } from "@/lib/sites/render";
import { klantCijfers, klantenCsv, klantenUit } from "@/lib/sites/klanten";
import { LEGE_WINKEL, type SiteProduct, type Winkel } from "@/lib/sites/types";

// De webshop van een klantsite (4 nov 2026): een winkelmand in één functioneel cookie,
// zoeken/filteren/sorteren, meer maten van één product in één bestelling, en klanten.

const product = (over: Partial<SiteProduct> = {}): SiteProduct => ({
  id: "paaaaaaa1",
  naam: "Hoodie",
  slug: "hoodie",
  prijsCents: 4995,
  korteTekst: "Zacht en warm",
  omschrijving: "Biologisch katoen.",
  fotos: [],
  categorie: "Kleding",
  zichtbaar: true,
  uitverkocht: false,
  opties: [{ naam: "Maat", waarden: ["S", "M", "L"] }],
  ...over,
});

const winkel = (): Winkel => ({
  ...LEGE_WINKEL,
  producten: [
    product(),
    product({ id: "pbbbbbbb2", naam: "Mok", slug: "mok", prijsCents: 1250, oudePrijsCents: 1500, categorie: "Wonen", opties: [], korteTekst: "Steengoed" }),
    product({ id: "pccccccc3", naam: "Sjaal", slug: "sjaal", prijsCents: 2995, categorie: "Kleding", opties: [], voorraad: 0, korteTekst: "Van wol" }),
    product({ id: "pdddddddd4", naam: "Kaars Café", slug: "kaars", prijsCents: 895, categorie: "Wonen", opties: [], voorraad: 3, korteTekst: "Geurkaars" }),
  ],
  levering: { afhalen: true, bezorgen: true, bezorgkostenCents: 495, gratisVanafCents: 7500 },
});

describe("winkelmand: het cookie", () => {
  it("schrijft en leest de mand terug, en negeert wat niet klopt", () => {
    const regels: MandRegel[] = [
      { productId: "paaaaaaa1", aantal: 2, keuzes: ["M"] },
      { productId: "pbbbbbbb2", aantal: 1, keuzes: [] },
    ];
    expect(leesMand(`a=b; zf_mand=${schrijfMand(regels)}; c=d`)).toEqual(regels);
    expect(leesMand("zf_mand=%E0%A4%A")).toEqual([]);
    expect(leesMand("zf_mand=xyz~3|paaaaaaa1~0|paaaaaaa1~2")).toEqual([{ productId: "paaaaaaa1", aantal: 2, keuzes: [] }]);
    expect(leesMand(null)).toEqual([]);
  });

  it("zet een cookie alleen voor deze site, niet leesbaar voor scripts, en haalt hem weg als de mand leeg is", () => {
    const c = mandCookie([{ productId: "paaaaaaa1", aantal: 1, keuzes: [] }], "/site/winkel/", true);
    expect(c).toMatch(/^zf_mand=paaaaaaa1~1; Path=\/site\/winkel\/; Max-Age=2592000; HttpOnly; SameSite=Lax; Secure$/);
    expect(mandCookie([], "/", false)).toBe("zf_mand=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax");
  });

  it("telt dezelfde keuze op en maakt van een andere maat een eigen regel", () => {
    let m = voegToe([], { productId: "paaaaaaa1", aantal: 1, keuzes: ["M"] });
    m = voegToe(m, { productId: "paaaaaaa1", aantal: 2, keuzes: ["M"] });
    m = voegToe(m, { productId: "paaaaaaa1", aantal: 1, keuzes: ["L"] });
    expect(m).toEqual([
      { productId: "paaaaaaa1", aantal: 3, keuzes: ["M"] },
      { productId: "paaaaaaa1", aantal: 1, keuzes: ["L"] },
    ]);
    expect(zetAantal(m, 0, 5)[0]!.aantal).toBe(5);
    expect(zetAantal(m, 0, 0)).toHaveLength(1);
    let veel: MandRegel[] = [];
    for (let i = 0; i < 15; i++) veel = voegToe(veel, { productId: "paaaaaaa1", aantal: 1, keuzes: [`x${i}`] });
    expect(veel).toHaveLength(MAX_VARIANTEN);
  });

  it("rekent met de winkel zoals hij nu is: weg = weg, uitverkocht of te weinig voorraad = melding", () => {
    const m = mandMetProducten(winkel(), [
      { productId: "paaaaaaa1", aantal: 2, keuzes: ["M"] },
      { productId: "pccccccc3", aantal: 1, keuzes: [] },
      { productId: "pdddddddd4", aantal: 5, keuzes: [] },
      { productId: "pzzzzzzz9", aantal: 1, keuzes: [] },
      { productId: "paaaaaaa1", aantal: 1, keuzes: ["XL"] },
    ]);
    expect(m.regels.map((r) => r.probleem)).toEqual([null, "Uitverkocht", "Nog 3 op voorraad", "Kies maat"]);
    expect(m.subtotaalCents).toBe(2 * 4995);
    expect(m.regels[0]!.variant).toBe("M");
  });

  it("vult het bestelformulier uit de mand, met een eigen regel per maat, en de bestelling klopt", () => {
    const m = mandMetProducten(winkel(), [
      { productId: "paaaaaaa1", aantal: 2, keuzes: ["M"] },
      { productId: "paaaaaaa1", aantal: 1, keuzes: ["L"] },
      { productId: "pbbbbbbb2", aantal: 3, keuzes: [] },
    ]);
    const invoer = mandNaarInvoer(m.regels);
    expect(invoer.aantallen).toEqual({ paaaaaaa1: 2, "paaaaaaa1-1": 1, pbbbbbbb2: 3 });
    // zoals het formulier het terugstuurt (verborgen velden)
    const form = new FormData();
    for (const [k, n] of Object.entries(invoer.aantallen)) form.set(`n_${k}`, String(n));
    for (const [k, w] of Object.entries(invoer.keuzes)) w.forEach((x, i) => form.set(`k_${k}_${i}`, x));
    form.set("naam", "Sanne");
    form.set("email", "sanne@zekerflex.test");
    form.set("telefoon", "0612345678");
    const { concept, fouten } = berekenBestelling(winkel(), leesBestelForm(form));
    expect(fouten).toEqual([]);
    expect(concept?.regels.map((r) => `${r.aantal} × ${r.naam}`)).toEqual(["2 × Hoodie (M)", "1 × Hoodie (L)", "3 × Mok"]);
    expect(concept?.totaalCents).toBe(3 * 4995 + 3 * 1250);
  });

  it("controleert de voorraad over alle maten van een product samen", () => {
    const w = winkel();
    w.producten[0] = { ...w.producten[0]!, voorraad: 2 };
    const form = new FormData();
    form.set("n_paaaaaaa1", "2");
    form.set("k_paaaaaaa1_0", "M");
    form.set("n_paaaaaaa1-1", "1");
    form.set("k_paaaaaaa1-1_0", "L");
    expect(berekenBestelling(w, leesBestelForm(form)).fouten).toContain("Van Hoodie zijn er nog 2.");
  });
});

describe("winkel: zoeken, filteren en sorteren", () => {
  const p = winkel().producten;
  it("leest het adres veilig uit", () => {
    expect(leesFilter(new URLSearchParams("q=+mok+&cat=Wonen&min=10&max=abc&voorraad=1&sort=prijs-op"))).toEqual({ q: "mok", cat: "Wonen", min: 10, max: null, voorraad: true, aanbieding: false, sort: "prijs-op" });
    expect(leesFilter(new URLSearchParams("sort=hack")).sort).toBe("aanbevolen");
  });

  it("zoekt in naam, tekst, categorie en maten, ook zonder accenten", () => {
    const zoek = (q: string) => filterProducten(p, { ...GEEN_FILTER, q }).map((x) => x.naam);
    expect(zoek("mok")).toEqual(["Mok"]);
    expect(zoek("cafe")).toEqual(["Kaars Café"]);
    expect(zoek("kleding")).toEqual(["Hoodie", "Sjaal"]);
    expect(zoek("zacht warm")).toEqual(["Hoodie"]);
  });

  it("filtert op categorie, prijs, voorraad en aanbieding, en zet uitverkocht onderaan", () => {
    expect(filterProducten(p, { ...GEEN_FILTER, cat: "Wonen" }).map((x) => x.naam)).toEqual(["Mok", "Kaars Café"]);
    expect(filterProducten(p, { ...GEEN_FILTER, min: 10, max: 30 }).map((x) => x.naam)).toEqual(["Mok", "Sjaal"]);
    expect(filterProducten(p, { ...GEEN_FILTER, voorraad: true }).map((x) => x.naam)).not.toContain("Sjaal");
    expect(filterProducten(p, { ...GEEN_FILTER, aanbieding: true }).map((x) => x.naam)).toEqual(["Mok"]);
    expect(filterProducten(p, { ...GEEN_FILTER, sort: "prijs-op" }).map((x) => x.naam)).toEqual(["Kaars Café", "Mok", "Hoodie", "Sjaal"]);
    expect(filterProducten(p, { ...GEEN_FILTER, sort: "prijs-af" }).map((x) => x.naam)).toEqual(["Hoodie", "Mok", "Kaars Café", "Sjaal"]);
  });

  it("maakt links met en zonder een filter", () => {
    const f = { ...GEEN_FILTER, q: "mok", cat: "Wonen", voorraad: true };
    expect(filterQuery(f)).toBe("?q=mok&cat=Wonen&voorraad=1");
    expect(actieveFilters(f).map((a) => [a.label, a.zonder])).toEqual([
      ["“mok”", "?cat=Wonen&voorraad=1"],
      ["Wonen", "?q=mok&voorraad=1"],
      ["Op voorraad", "?q=mok&cat=Wonen"],
    ]);
    expect(filterQuery(GEEN_FILTER)).toBe("");
  });
});

describe("klanten", () => {
  it("voegt bestellingen en reserveringen samen per e-mailadres", () => {
    const k = klantenUit(
      [
        { at: "2026-11-01T10:00:00Z", status: "afgerond", totaalCents: 2500, invoer: { naam: "Sanne", email: "Sanne@Zekerflex.test", telefoon: "06 1234 5678", plaats: "Zwolle" } },
        { at: "2026-11-03T10:00:00Z", status: "geannuleerd", totaalCents: 9900, invoer: { naam: "Sanne de Vries", email: "sanne@zekerflex.test", telefoon: "", plaats: "" } },
        { at: "2026-11-02T10:00:00Z", status: "nieuw", totaalCents: 1000, invoer: { naam: "Bas", email: "", telefoon: "0687654321", plaats: "" } },
      ],
      [{ at: "2026-11-04T10:00:00Z", datum: "2026-11-06", status: "bevestigd", personen: 2, naam: "Bas", email: "", telefoon: "+31 6 87654321" }],
    );
    expect(k).toHaveLength(2);
    expect(k[0]).toMatchObject({ naam: "Bas", bestellingen: 1, reserveringen: 1, besteedCents: 1000 });
    expect(k[1]).toMatchObject({ naam: "Sanne de Vries", bestellingen: 2, besteedCents: 2500, plaats: "Zwolle", eerste: "2026-11-01T10:00:00Z" });
    expect(klantCijfers(k)).toEqual({ aantal: 2, terugkerend: 2, gemiddeldCents: 1750 });
    expect(klantenCsv([{ ...k[0]!, naam: "=SOM(A1)" }])).toContain(`"'=SOM(A1)"`);
  });
});

describe("webshop: weergave", () => {
  const site = { pages: [{ id: "home", slug: "", titel: "Home", seoTitel: "", seoOmschrijving: "", blocks: [] }], media: [], theme: { kleur: "#1D1D1F", accent: "#F2A541", lettertype: "modern" as const, hoeken: "rond" as const, stijl: "beleving" as const }, bedrijf: { naam: "Winkel <Noord>", kvk: "", straat: "", postcode: "", plaats: "Zonnedorp", telefoon: "", email: "" }, winkel: winkel() };
  const opts = { root: "/site/noord/", origin: "https://zekerflex.com", mandAantal: 3 };

  it("zet 'In winkelmand' op de productpagina, met verplichte maat, en het mandje met aantal in de kop", () => {

    const html = renderWinkelPagina(site, { soort: "product", slug: "hoodie" }, opts) ?? "";
    expect(html).toContain('<form class="buy" method="get" action="/site/noord/mand"><input type="hidden" name="voeg" value="paaaaaaa1">');
    expect(html).toContain('name="o0" required');
    expect(html).toContain("In winkelmand");
    expect(html).toContain('<a class="mandlink" href="/site/noord/mand">');
    expect(html).toContain("<b>3</b>");
    expect(html).not.toMatch(/<script(?! type="application\/ld\+json")/);
  });

  it("toont de winkel met zoeken en filters, en filtert", () => {

    const html = renderWinkelPagina(site, { soort: "winkel", filter: { ...GEEN_FILTER, cat: "Wonen" } }, opts) ?? "";
    expect(html).toContain('role="search"');
    expect(html).toContain("2 producten gevonden");
    expect(html).toContain('href="/site/noord/winkel">Alles</a>');
    expect(html).toContain('href="/site/noord/winkel?cat=Wonen" aria-current="true">Wonen</a>');
    expect(html).toContain('<input type="checkbox" id="wf-open" class="wf-toggle" checked>');
    expect(html).not.toContain(">Hoodie<");
  });

  it("toont de winkelmand met bijwerken, verwijderen, overzicht en afrekenen", () => {

    const mand = mandMetProducten(winkel(), [{ productId: "paaaaaaa1", aantal: 1, keuzes: ["M"] }]);
    const html = renderWinkelPagina(site, { soort: "mand", mand, melding: "Hoodie staat in je winkelmand." }, opts) ?? "";
    expect(html).toContain('<p class="mmelding" role="status">Hoodie staat in je winkelmand.</p>');
    expect(html).toContain('<input type="hidden" name="zet" value="0">');
    expect(html).toContain('<input type="hidden" name="weg" value="0">');
    expect(html).toContain("Nog € 25,05 tot gratis bezorgen.");
    expect(html).toContain('href="/site/noord/bestellen">Afrekenen</a>');
    const leeg = renderWinkelPagina(site, { soort: "mand", mand: mandMetProducten(winkel(), []), melding: "" }, opts) ?? "";
    expect(leeg).toContain("Je winkelmand is leeg.");
  });

  it("toont bij afrekenen uit de mand alleen wat erin zit, met verborgen regels per maat", () => {

    const mand = mandMetProducten(winkel(), [
      { productId: "paaaaaaa1", aantal: 2, keuzes: ["M"] },
      { productId: "paaaaaaa1", aantal: 1, keuzes: ["L"] },
    ]);
    const html = renderWinkelPagina(site, { soort: "bestellen", invoer: mandNaarInvoer(mand.regels), vanMand: true }, opts) ?? "";
    expect(html).toContain('<input type="hidden" name="n_paaaaaaa1-1" value="1">');
    expect(html).toContain('<input type="hidden" name="k_paaaaaaa1-1_0" value="L">');
    expect(html).toContain('<input type="hidden" name="bron" value="mand">');
    expect(html).toContain("Wijzig je winkelmand");
    expect(html).not.toContain("n_pbbbbbbb2");
  });
});
