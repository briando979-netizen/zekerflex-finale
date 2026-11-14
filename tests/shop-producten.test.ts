import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { centenNaarEuro, effectieveVoorraad, euroNaarCenten, heeftWijziging, slugUitNaam, snelWijziging, uniekeSlug, voorraadInLijst, voorraadNaarGetal } from "@/lib/shop/product-formulier";

const lees = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8").split("\r\n").join("\n");

describe("prijzen in euro in plaats van centen", () => {
  it("leest een bedrag zoals een mens het typt", () => {
    expect(euroNaarCenten("12,95")).toBe(1295);
    expect(euroNaarCenten("12.95")).toBe(1295);
    expect(euroNaarCenten("€ 12")).toBe(1200);
    expect(euroNaarCenten("12,5")).toBe(1250);
    expect(euroNaarCenten("1.234,50")).toBe(123450);
    expect(euroNaarCenten("1.234")).toBe(123400);
    expect(euroNaarCenten("0")).toBe(0);
  });

  it("weigert wat geen bedrag is: leeg, tekst, negatief, te veel decimalen, te groot", () => {
    for (const rare of ["", "  ", "abc", "-5", "12,345", "1,2,3", "€", "9999999"]) expect(euroNaarCenten(rare), rare).toBeNull();
  });

  it("zet centen weer om voor in het veld", () => {
    expect(centenNaarEuro(1295)).toBe("12,95");
    expect(centenNaarEuro(1200)).toBe("12,00");
    expect(centenNaarEuro(0)).toBe("0,00");
    expect(centenNaarEuro(null)).toBe("");
    expect(euroNaarCenten(centenNaarEuro(123456))).toBe(123456);
  });
});

describe("het webadres komt vanzelf uit de naam", () => {
  it("maakt een nette slug zonder accenten en leestekens", () => {
    expect(slugUitNaam("Werkhandschoen Grip, maat L")).toBe("werkhandschoen-grip-maat-l");
    expect(slugUitNaam("Café-jas & Muts")).toBe("cafe-jas-en-muts");
    expect(slugUitNaam("  --Test--  ")).toBe("test");
    expect(slugUitNaam("!!!")).toBe("");
    expect(slugUitNaam("a".repeat(100)).length).toBeLessThanOrEqual(60);
  });

  it("maakt hem uniek en valt terug op product", () => {
    expect(uniekeSlug("jas", ["muts"])).toBe("jas");
    expect(uniekeSlug("jas", ["jas"])).toBe("jas-2");
    expect(uniekeSlug("jas", ["jas", "jas-2", "jas-3"])).toBe("jas-4");
    expect(uniekeSlug("", [])).toBe("product");
    expect(uniekeSlug("", ["product"])).toBe("product-2");
  });
});

describe("snel aanpassen in de lijst", () => {
  const een = { priceCents: 1295, stock: 10, active: true, variants: [] as { id: string; stock: number }[] };

  it("bewaart alleen wat veranderd is", () => {
    const w = snelWijziging(een, { prijsTekst: "14,50", voorraadTekst: "10", actief: true });
    expect(w.product).toEqual({ priceCents: 1450 });
    expect(w.variant).toBeNull();
    expect(heeftWijziging(w)).toBe(true);
    expect(heeftWijziging(snelWijziging(een, { prijsTekst: "12,95", voorraadTekst: "10", actief: true }))).toBe(false);
  });

  it("zonder varianten gaat de voorraad naar het product", () => {
    expect(snelWijziging(een, { prijsTekst: "12,95", voorraadTekst: "25", actief: true }).product).toEqual({ stock: 25 });
  });

  it("met één variant gaat de voorraad naar die variant (daar kijkt de bestelling naar)", () => {
    const p = { ...een, stock: 0, variants: [{ id: "v1", stock: 10 }] };
    const w = snelWijziging(p, { prijsTekst: "12,95", voorraadTekst: "3", actief: true });
    expect(w.product).toEqual({});
    expect(w.variant).toEqual({ id: "v1", stock: 3 });
  });

  it("met meerdere varianten staat de voorraad niet in de lijst; de som wordt getoond", () => {
    const p = { ...een, variants: [{ id: "a", stock: 4 }, { id: "b", stock: 6 }] };
    expect(voorraadInLijst(p)).toBe(false);
    expect(effectieveVoorraad(p)).toBe(10);
    // een ongeldige voorraadtekst telt dan niet mee
    expect(snelWijziging(p, { prijsTekst: "12,95", voorraadTekst: "rommel", actief: true }).fouten).toEqual([]);
  });

  it("geeft meldingen in gewoon Nederlands bij een ongeldige prijs of voorraad en slaat dan niets op", () => {
    const w = snelWijziging(een, { prijsTekst: "gratis", voorraadTekst: "-3", actief: false });
    expect(w.fouten).toEqual(["Vul de prijs in euro in, bijvoorbeeld 12,95.", "Vul de voorraad in als een heel getal, bijvoorbeeld 25."]);
    expect(voorraadNaarGetal("25")).toBe(25);
    expect(voorraadNaarGetal("2,5")).toBeNull();
  });

  it("zichtbaar of verborgen is ook een wijziging", () => {
    expect(snelWijziging(een, { prijsTekst: "12,95", voorraadTekst: "10", actief: false }).product).toEqual({ active: false });
  });
});

describe("de lijst en het formulier in Beheer", () => {
  it("de lijst gebruikt de bestaande opslaan-routes, neemt de serverversie over en meldt fouten met role=alert", () => {
    const cellen = lees("components/admin/ShopSnelCellen.tsx");
    expect(cellen).toContain("/api/shop/products/${product.id}`, { method: \"PATCH\"");
    expect(cellen).toContain("/variants/${w.variant.id}");
    expect(cellen).toContain("onBijgewerkt(serverProduct, serverVariant)");
    expect(cellen).toContain('role="alert"');
    expect(cellen).toContain('role="switch"');
    expect(cellen).not.toMatch(/window\.alert|\balert\(/);
    expect(cellen).toContain("kanZichtbaarWorden(");
    const scherm = lees("components/admin/ShopAdmin.tsx");
    expect(scherm).toContain("<ShopSnelCellen");
    expect(scherm).toContain("setProducts((lijst) => lijst.map((p) => (p.id === product.id ?");
    // geen tweede opslaan-route gebouwd
    expect(lees("app/api/shop/products/[id]/route.ts")).toContain("export const PATCH");
  });

  it("het formulier vraagt euro's, maakt het webadres zelf en verbergt de zeldzame velden", () => {
    const scherm = lees("components/admin/ShopAdmin.tsx");
    expect(scherm).toContain("Verkoopprijs in euro");
    expect(scherm).not.toContain("Verkoop (centen)");
    expect(scherm).not.toContain("Inkoop (centen)");
    expect(scherm).toContain("Webadres (optioneel)");
    expect(scherm).toContain("uniekeSlug(slugUitNaam(form.name)");
    expect(scherm).toContain("Meer opties (badge, volgorde, collectie)");
    expect(scherm).toContain("Vul de verkoopprijs in euro in, bijvoorbeeld 12,95.");
  });
});