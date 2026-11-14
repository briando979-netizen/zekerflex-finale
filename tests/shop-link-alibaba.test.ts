import { describe, expect, it } from "vitest";
import { alibabaGegevensAdres, ideeUitLink, isBruikbaar, leesProductPagina, leverancierTekst, linkWaarschuwingen } from "@/lib/shop/link-product";

// Alibaba (14 nov, dropshippinglink van de eigenaar). Gemeten: /product-detail/… geeft een robot een captcha, dezelfde
// pagina onder /product-introduction/…_<nummer>.html heeft JSON-LD Product. De tekst begint met "Alibaba.com:" en eindigt
// met "Minimum order quantity 100 pieces …"; de prijs is een groothandelsprijs in dollars. Kleine nagemaakte pagina,
// zonder echte foto's.

const INTRO = "https://www.alibaba.com/product-introduction/_60732389571.html";
const PAGINA = `<html><head><title>Alibaba.com: GS Soft TPU Cover Case, Transparent design : Minimum order quantity 100 pieces with quick delivery in 3-7 days.</title>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Anti Fingerprint Soft TPU Cover Case",
"description":"Alibaba.com: GS Anti Fingerprint Soft TPU Cover Case, Eco-friendly material, Transparent design : Minimum order quantity 100 pieces with quick delivery in 3-7 days.",
"image":["https://cdn.example/1.jpg","https://cdn.example/2.jpg"],
"offers":{"@type":"Offer","availability":"https://schema.org/InStock","priceCurrency":"USD","price":"0.29","priceValidUntil":"2027-11-13"}}</script>
</head><body></body></html>`;

describe("een losse productpagina van Alibaba", () => {
  it("leest naam, foto's en prijs, zonder het voorvoegsel en de verkoopzin in de omschrijving", () => {
    const p = leesProductPagina(PAGINA, INTRO);
    expect(p).toEqual({
      titel: "Anti Fingerprint Soft TPU Cover Case",
      omschrijving: "GS Anti Fingerprint Soft TPU Cover Case, Eco-friendly material, Transparent design",
      fotos: ["https://cdn.example/1.jpg", "https://cdn.example/2.jpg"],
      prijsCents: 29,
      valuta: "USD",
      minimumAfname: { aantal: 100, eenheid: "stuks", levertijdDagen: "3-7" },
    });
    expect(isBruikbaar(p)).toBe(true);
    expect(ideeUitLink(p!)).not.toMatch(/alibaba\.com|minimum order/i);
  });

  it("de minimale afname en de dollarprijs worden waarschuwingen; de prijs is een inkoopprijs, geen verkoopprijs", () => {
    const w = linkWaarschuwingen(leesProductPagina(PAGINA, INTRO)!);
    expect(w).toHaveLength(2);
    expect(w[0]).toBe("Minimale afname bij deze leverancier: 100 stuks, levering in 3-7 dagen. Minder kun je daar niet bestellen; vraag het na als je per bestelling wilt laten leveren.");
    expect(w[1]).toContain("inkoopprijs: USD 0,29 per stuk bij afname vanaf 100 stuks");
    expect(w[1]).toContain("geen verkoopprijs");
  });

  it("zonder minimale afname en met een prijs in euro's: geen waarschuwingen", () => {
    expect(linkWaarschuwingen({ titel: "Vest", omschrijving: "Warm.", fotos: [], prijsCents: 1250, valuta: "EUR" })).toEqual([]);
  });

  it("de titel als enige bron: ook daar gaan voorvoegsel en verkoopzin eraf", () => {
    const p = leesProductPagina(`<title>Alibaba.com: Werkhandschoen nitril : Minimum order quantity 1,000 pairs</title><meta property="og:image" content="https://cdn.example/h.jpg">`, INTRO);
    expect(p).toMatchObject({ titel: "Werkhandschoen nitril", minimumAfname: { aantal: 1000, eenheid: "paar", levertijdDagen: null } });
  });
});

describe("leverancierTekst", () => {
  it("laat een gewone tekst ongemoeid", () => {
    expect(leverancierTekst("Warm vest voor buitenwerk.")).toEqual({ tekst: "Warm vest voor buitenwerk.", minimum: null });
  });

  it("een verkoopzin zonder getal gaat er wel af, maar geeft geen minimum", () => {
    expect(leverancierTekst("Mok, blauw : Minimum order quantity on request")).toEqual({ tekst: "Mok, blauw", minimum: null });
  });

  it("een onbekende eenheid blijft staan zoals de leverancier hem noemt", () => {
    expect(leverancierTekst("Tape : Minimum order quantity 50 dozen").minimum).toEqual({ aantal: 50, eenheid: "dozen", levertijdDagen: null });
  });
});

describe("alibabaGegevensAdres", () => {
  it("een productlink wordt de leesbare introductiepagina van hetzelfde product", () => {
    expect(alibabaGegevensAdres("https://www.alibaba.com/product-detail/Anti-Fingerprint-Soft-TPU-Cover-Case_60732389571.html")).toBe(INTRO);
    expect(alibabaGegevensAdres("https://www.alibaba.com/product-detail/_60732389571.html?spm=a2700.galleryofferlist")).toBe(INTRO);
    expect(alibabaGegevensAdres("https://dutch.alibaba.com/product-introduction/Case_60732389571.html")).toBe(INTRO);
  });

  it("het dropshipping-overzicht, een andere website of http geven niets", () => {
    expect(alibabaGegevensAdres("https://www.alibaba.com/dropshipping/products")).toBeNull();
    expect(alibabaGegevensAdres("https://alibaba.com.kwaadaardig.example/product-detail/x_60732389571.html")).toBeNull();
    expect(alibabaGegevensAdres("http://www.alibaba.com/product-detail/x_60732389571.html")).toBeNull();
    expect(alibabaGegevensAdres("https://www.aliexpress.com/item/1005006.html")).toBeNull();
    expect(alibabaGegevensAdres("geen adres")).toBeNull();
  });
});
