import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ideeUitLink, leesProductPagina, prijsNaarCents } from "@/lib/shop/link-product";

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
    expect(server).toContain("fetchPage(url.trim()");
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
