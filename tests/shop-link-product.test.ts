import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ideeUitLink, isBruikbaar, leesProductPagina, leesShopifyProduct, leesWooProduct, prijsNaarCents, shopifyGegevensAdres, wooGegevensAdres } from "@/lib/shop/link-product";

// "Product van een link" in de Winkel-AI (13 nov): uit de pagina van een leverancier de naam, omschrijving, foto en prijs
// lezen. Soepel: wat ontbreekt blijft leeg, en een pagina zonder gegevens (AliExpress geeft een robot een lege pagina) geeft null.

const bron = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");
const BASIS = "https://leverancier.example/product/fleece-vest";

describe("een productpagina lezen", () => {
  it("JSON-LD Product: naam, omschrijving, foto's en prijs", () => {
    const html = `<html><head><script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Fleece vest &amp; rits","description":"<p>Warm vest voor buitenwerk.</p>","image":["https://cdn.example/a.jpg","/b.jpg"],"offers":{"@type":"Offer","price":"12.50","priceCurrency":"eur"}}</script></head></html>`;
    expect(leesProductPagina(html, BASIS)).toEqual({ titel: "Fleece vest & rits", omschrijving: "Warm vest voor buitenwerk.", fotos: ["https://cdn.example/a.jpg", "https://leverancier.example/b.jpg"], prijsCents: 1250, valuta: "EUR" });
  });

  it("ook in @graph, met een lijst van aanbiedingen en een foto als object", () => {
    const html = `<script type='application/ld+json'>{"@graph":[{"@type":"WebSite","name":"Winkel"},{"@type":["Product","Thing"],"name":"Werkhandschoen","image":{"url":"https://cdn.example/h.png"},"offers":[{"lowPrice":3.2,"priceCurrency":"USD"}]}]}</script>`;
    expect(leesProductPagina(html, BASIS)).toMatchObject({ titel: "Werkhandschoen", fotos: ["https://cdn.example/h.png"], prijsCents: 320, valuta: "USD" });
  });

  it("zonder JSON-LD: de og-tags, in beide volgordes van de attributen", () => {
    const html = `<head><title>Niet deze</title><meta property="og:title" content="Thermo sokken 3-pack"><meta content="Warme sokken voor in de werkschoen." property="og:description"><meta property="og:image" content="//cdn.example/sok.jpg"><meta property="product:price:amount" content="7,95"><meta property="product:price:currency" content="EUR"></head>`;
    expect(leesProductPagina(html, BASIS)).toEqual({ titel: "Thermo sokken 3-pack", omschrijving: "Warme sokken voor in de werkschoen.", fotos: ["https://cdn.example/sok.jpg"], prijsCents: 795, valuta: "EUR" });
  });

  it("één kapot JSON-blok breekt het lezen niet; het volgende blok telt", () => {
    const html = `<script type="application/ld+json">{kapot</script><script type="application/ld+json">{"@type":"Product","name":"Helm","description":"Stevige helm."}</script>`;
    expect(leesProductPagina(html, BASIS)).toMatchObject({ titel: "Helm", omschrijving: "Stevige helm.", fotos: [], prijsCents: null, valuta: null });
  });

  it("een lege pagina (zoals een marktplaats die een robot geeft) geeft niets", () => {
    expect(leesProductPagina(`<html><head><title></title><meta property="og:title" content="" /><meta property="og:image" content="" /></head><body></body></html>`, BASIS)).toBeNull();
    expect(leesProductPagina("", BASIS)).toBeNull();
  });

  it("alleen https-foto's, geen dubbele, hooguit zes; geen script of opmaak in de tekst", () => {
    const fotos = Array.from({ length: 9 }, (_, i) => `"https://cdn.example/${i}.jpg"`).join(",");
    const html = `<script type="application/ld+json">{"@type":"Product","name":"Jas <b onclick=\\"x()\\">stevig</b>","description":"Regel 1<br>Regel   2","image":["http://onveilig.example/x.jpg","javascript:alert(1)","https://cdn.example/0.jpg",${fotos}]}</script>`;
    const p = leesProductPagina(html, BASIS);
    expect(p?.fotos).toHaveLength(6);
    expect(p?.fotos[0]).toBe("https://cdn.example/0.jpg");
    expect(p?.titel).toBe("Jas stevig");
    expect(p?.omschrijving).toBe("Regel 1 Regel 2");
  });

  it("lange teksten worden afgekapt", () => {
    const p = leesProductPagina(`<meta property="og:title" content="${"a".repeat(500)}"><meta property="og:description" content="${"b".repeat(5000)}">`, BASIS);
    expect(p?.titel).toHaveLength(160);
    expect(p?.omschrijving).toHaveLength(1500);
    expect(ideeUitLink(p!).length).toBeLessThanOrEqual(1500);
  });
});

describe("prijzen", () => {
  it("Nederlandse en Engelse schrijfwijze", () => {
    expect(prijsNaarCents("12,50")).toBe(1250);
    expect(prijsNaarCents("12.5")).toBe(1250);
    expect(prijsNaarCents("€ 1.299,00")).toBe(129900);
    expect(prijsNaarCents("1,299.00")).toBe(129900);
    expect(prijsNaarCents("1.299")).toBe(129900);
    expect(prijsNaarCents(8)).toBe(800);
    for (const v of ["", "gratis", 0, -3, null, undefined, {}]) expect(prijsNaarCents(v)).toBeNull();
  });
});

describe("de route, het opslaan en het scherm", () => {
  it("de route is alleen voor de platformbeheerder en slaat niets op", () => {
    const route = bron("app/api/admin/shop-ai/link/route.ts");
    expect(route).toContain('withAdminAccess(["PLATFORM_ADMIN"]');
    expect(route).not.toContain("prisma");
    // begrensd per gebruiker
    expect(route).toContain('enforceRateLimit({ name: "shop-ai-link", identifier: principal.userId');
  });

  it("ophalen gaat via de veilige ophaler en het logboek krijgt alleen de website, nooit het hele adres", () => {
    const server = bron("lib/shop/link-product-server.ts");
    // een Alibaba-link gaat naar de leesbare introductiepagina, verder het adres zelf; beide via de veilige ophaler
    expect(server).toContain("fetchPage(alibaba ?? url.trim()");
    expect(server).toContain("importRemoteImage(fotoUrl)");
    expect(server).toContain('logger.info("winkel-ai: link gaf geen productgegevens", { host: bron });');
    expect(server).not.toMatch(/logger\.\w+\([^)]*\burl\b/);
    // een pagina zonder gegevens geeft een eerlijke uitleg met de uitweg
    expect(server).toContain("AliExpress, Temu en Amazon");
  });

  it("opslaan neemt de foto van het adres over en het product blijft uit", () => {
    const ai = bron("lib/shop/winkel-ai.ts");
    expect(ai).toContain("if (inv.fotoUrl) {");
    expect(ai).toContain("} else if (inv.metFoto) {");
    expect(ai).toContain("active: false,");
    // waar het vandaan komt wordt bij het concept bewaard
    expect(ai).toContain("await bewaarLinkBron(product.id, { pagina: inv.bronUrl, foto: inv.fotoUrl });");
    expect(ai).toMatch(/fotoUrl: z\.string\(\)\.trim\(\)\.max\(600\)\.regex\(\/\^https:/);
  });

  it("het scherm heeft het vak voor de link en het adres van de foto, met de uitleg over marktplaatsen", () => {
    const scherm = bron("components/admin/WinkelAI.tsx");
    expect(scherm).toContain('"/api/admin/shop-ai/link"');
    expect(scherm).toContain("Link naar het product bij je leverancier");
    expect(scherm).toContain("Adres van de productfoto");
    expect(scherm).toContain("...(fotoUrl.trim() ? { fotoUrl: fotoUrl.trim() } : {}),");
    expect(scherm).toContain("AliExpress, Temu en Amazon laten dat niet toe");
    expect(scherm).toContain("controleer of je de foto mag gebruiken");
    expect(scherm).toContain("De verkoopprijs kies je zelf.");
  });

  it("de wegwijzer zegt waar je de webshop beheert", () => {
    const w = bron("lib/ontwerp/wegwijzer.ts");
    expect(w).toContain('doel: { pagina: "/admin/shop" }');
    expect(w).toContain('doel: { pagina: "/admin/shop-ai" }');
  });
});

describe("meer bronnen: winkelsystemen met een gegevensadres", () => {
  it("Shopify: het adres en het lezen van het product", () => {
    expect(shopifyGegevensAdres("https://winkel.example/collections/jassen/products/fleece-vest?variant=12")).toBe("https://winkel.example/products/fleece-vest.json");
    expect(shopifyGegevensAdres("https://winkel.example/nl/products/Fleece_Vest/")).toBe("https://winkel.example/products/Fleece_Vest.json");
    for (const u of ["https://winkel.example/over-ons", "http://winkel.example/products/x", "geen adres", "https://winkel.example/products/"]) expect(shopifyGegevensAdres(u), u).toBeNull();
    const json = { product: { title: "Fleece vest", body_html: "<p>Warm &amp; licht.</p>", image: { src: "https://cdn.example/1.jpg" }, images: [{ src: "https://cdn.example/1.jpg" }, { src: "//cdn.example/2.jpg" }, { src: 4 }], variants: [{ price: "24.95" }] } };
    expect(leesShopifyProduct(json, "https://winkel.example/products/fleece-vest")).toEqual({ titel: "Fleece vest", omschrijving: "Warm & licht.", fotos: ["https://cdn.example/1.jpg", "https://cdn.example/2.jpg"], prijsCents: 2495, valuta: null });
    for (const kapot of [null, "x", {}, { product: null }, { product: { title: "" } }, []]) expect(leesShopifyProduct(kapot, "https://winkel.example/")).toBeNull();
  });

  it("WooCommerce: het adres en het lezen van het product, met de prijs in centen", () => {
    expect(wooGegevensAdres("https://zaak.example/product/thermo-sokken/")).toBe("https://zaak.example/wp-json/wc/store/v1/products?slug=thermo-sokken");
    expect(wooGegevensAdres("https://zaak.example/winkel/kleding/thermo-sokken")).toBe("https://zaak.example/wp-json/wc/store/v1/products?slug=thermo-sokken");
    expect(wooGegevensAdres("https://zaak.example/contact")).toBeNull();
    const json = [{ name: "Thermo sokken", short_description: "", description: "<p>Warme sokken.</p>", images: [{ src: "https://zaak.example/wp-content/sok.jpg" }], prices: { price: "795", currency_code: "EUR", currency_minor_unit: 2 } }];
    expect(leesWooProduct(json, "https://zaak.example/product/thermo-sokken/")).toEqual({ titel: "Thermo sokken", omschrijving: "Warme sokken.", fotos: ["https://zaak.example/wp-content/sok.jpg"], prijsCents: 795, valuta: "EUR" });
    // een munt zonder centen (yen): 500 blijft 500 hele eenheden
    expect(leesWooProduct([{ name: "Ding", description: "Iets.", prices: { price: "500", currency_code: "JPY", currency_minor_unit: 0 } }], "https://zaak.example/")?.prijsCents).toBe(50000);
    for (const kapot of [null, {}, [], [null], [{ name: "" }]]) expect(leesWooProduct(kapot, "https://zaak.example/")).toBeNull();
  });

  it("bruikbaar = een naam met een omschrijving of een foto", () => {
    expect(isBruikbaar(null)).toBe(false);
    expect(isBruikbaar({ titel: "X", omschrijving: "", fotos: [], prijsCents: null, valuta: null })).toBe(false);
    expect(isBruikbaar({ titel: "X", omschrijving: "", fotos: ["https://cdn.example/a.jpg"], prijsCents: null, valuta: null })).toBe(true);
  });

  it("de server probeert eerst de pagina en dan de gegevensadressen, steeds via de veilige ophaler", () => {
    const server = bron("lib/shop/link-product-server.ts");
    expect(server.indexOf("leesProductPagina(pagina.body")).toBeLessThan(server.indexOf("shopifyGegevensAdres(pagina.finalUrl)"));
    expect(server.indexOf("shopifyGegevensAdres(pagina.finalUrl)")).toBeLessThan(server.indexOf("wooGegevensAdres(pagina.finalUrl)"));
    expect(server).toContain("await fetchPage(adres, { timeoutMs: 10_000, maxBytes: 1_500_000 })");
    // geen eigen fetch buiten de veilige ophaler om
    expect(server).not.toMatch(/[^a-zA-Z]fetch\(/);
  });
});

describe("een winkel die we niet kunnen lezen: eerlijk zeggen, geen lege poging", () => {
  it("een blokkade- of controlepagina is geen product, ook als er tekst of een afbeelding op staat", () => {
    for (const titel of ["Just a moment...", "Robot Check", "Access Denied", "Captcha Interception", "Attention Required! | Cloudflare", "Are you a human?"]) {
      const p = leesProductPagina(`<html><head><title>${titel}</title><meta property="og:description" content="Bevestig dat je een mens bent." /></head></html>`, BASIS);
      expect(isBruikbaar(p), titel).toBe(false);
    }
    // een echt product met een gewone titel blijft bruikbaar
    expect(isBruikbaar(leesProductPagina(`<html><head><title>Werkjas</title><meta property="og:description" content="Warme jas." /></head></html>`, BASIS))).toBe(true);
  });

  it("een lege titel (AliExpress, Temu of Amazon zonder gegevens) is niet bruikbaar", () => {
    expect(isBruikbaar(leesProductPagina("<html><head><title>AliExpress</title></head><body></body></html>", BASIS))).toBe(false);
    expect(isBruikbaar(leesProductPagina("<html><head><title></title></head></html>", BASIS))).toBe(false);
  });

  it("de melding zegt in gewoon Nederlands dat de winkel niet te lezen is en dat je de tekst zelf plakt; het scherm toont hem als fout, zonder concept", () => {
    const server = bron("lib/shop/link-product-server.ts");
    expect(server).toContain("Grote marktplaatsen zoals AliExpress, Temu en Amazon laten hun pagina's niet door een programma lezen.");
    expect(server).toContain("Bij Alibaba werkt de link van één product (…/product-detail/… of …/product-introduction/…), een overzicht zoals de dropshipping-producten niet.");
    expect(server).toContain("Kopieer anders zelf de naam en de omschrijving en plak ze in het vak hieronder");
    expect(server).toContain("throw AppError.validation(NIET_LEESBAAR)");
    const scherm = bron("components/admin/WinkelAI.tsx");
    expect(scherm).toContain("setLinkMelding({ tekst: (e as Error).message, fout: true })");
  });
});
