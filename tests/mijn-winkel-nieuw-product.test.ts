import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LEEG, conceptBody, heeftFoto, heeftLinkPad, magInDeWinkel, productBody, stapFouten, vulUitLink, type NieuwVelden } from "@/lib/shop/nieuw-stappen";

const lees = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8").split("\r\n").join("\n");
const klaar: NieuwVelden = { ...LEEG, naam: "Werkhandschoen Grip", omschrijving: "Stevige handschoen met extra grip voor buitenwerk.", prijsTekst: "12,95", voorraadTekst: "25", imageUploadId: "up1", imageUrl: "/api/shop/media/up1" };

describe("Product toevoegen in drie stappen: de regels", () => {
  it("stap 1 heeft niets verplicht; stap 2 wil naam, omschrijving en een prijs in euro", () => {
    expect(stapFouten(1, LEEG)).toEqual([]);
    expect(stapFouten(2, LEEG)).toEqual([
      "Geef het product een naam van minstens twee tekens.",
      "Schrijf een korte omschrijving van minstens tien tekens, of laat de Winkel-AI er een maken.",
      "Vul de verkoopprijs in euro in, bijvoorbeeld 12,95.",
    ]);
    expect(stapFouten(2, klaar)).toEqual([]);
    expect(stapFouten(2, { ...klaar, omschrijving: "x".repeat(601) })).toContain("De omschrijving is te lang: hooguit 600 tekens.");
  });

  it("stap 3 wil een voorraad als heel getal, behalve via een link (daar zet je hem in de lijst)", () => {
    expect(stapFouten(3, { ...klaar, voorraadTekst: "veel" })).toEqual(["Vul de voorraad in als een heel getal, bijvoorbeeld 25."]);
    expect(stapFouten(3, klaar)).toEqual([]);
    const viaLink = { ...klaar, imageUploadId: null, imageUrl: null, fotoUrl: "https://cdn.example/a.jpg", voorraadTekst: "veel" };
    expect(heeftLinkPad(viaLink)).toBe(true);
    expect(stapFouten(3, viaLink)).toEqual([]);
  });

  it("een gelezen link vult naam en omschrijving in (zonder iets te overschrijven) en bewaart de bron; een prijs wordt nooit de verkoopprijs", () => {
    const v = vulUitLink(LEEG, { idee: "Fleece vest\n\nWarm vest voor buitenwerk.", fotos: ["https://cdn.example/a.jpg", "https://cdn.example/b.jpg"] }, " https://leverancier.example/vest ");
    expect(v).toMatchObject({ naam: "Fleece vest", omschrijving: "Warm vest voor buitenwerk.", fotoUrl: "https://cdn.example/a.jpg", bronUrl: "https://leverancier.example/vest", prijsTekst: "" });
    const bewaard = vulUitLink({ ...LEEG, naam: "Mijn eigen naam" }, { idee: "Titel\n\nTekst", fotos: [] }, "https://x.example/p");
    expect(bewaard.naam).toBe("Mijn eigen naam");
    expect(bewaard.fotoUrl).toBe("");
  });

  it("in de winkel zetten mag alleen met een foto en een prijs; een foto van een link is eerst een concept", () => {
    expect(magInDeWinkel(klaar)).toBeNull();
    expect(magInDeWinkel({ ...klaar, imageUrl: null, imageUploadId: null })).toMatch(/echte foto/);
    expect(magInDeWinkel({ ...klaar, prijsTekst: "0" })).toMatch(/prijs/);
    expect(magInDeWinkel({ ...klaar, imageUrl: null, imageUploadId: null, fotoUrl: "https://cdn.example/a.jpg" })).toMatch(/concept/);
    expect(heeftFoto(LEEG)).toBe(false);
    expect(heeftFoto(klaar)).toBe(true);
  });
});

describe("Product toevoegen in drie stappen: de aanvragen aan de bestaande routes", () => {
  it("een eigen foto of geen foto gaat naar /api/shop/products met een webadres vanzelf, centen en de gekozen zichtbaarheid", () => {
    const b = productBody(klaar, ["muts"], false);
    expect(b).toMatchObject({ name: "Werkhandschoen Grip", slug: "werkhandschoen-grip", priceCents: 1295, stock: 25, active: false, imageUploadId: "up1", imageUrl: "/api/shop/media/up1", category: "Werkdag", costCents: null });
    expect(productBody(klaar, ["werkhandschoen-grip"], true).slug).toBe("werkhandschoen-grip-2");
    expect(productBody(klaar, [], true).active).toBe(true);
    const zonderFoto = productBody({ ...klaar, imageUploadId: null, imageUrl: null }, [], false);
    expect("imageUrl" in zonderFoto).toBe(false);
  });

  it("een link gaat als concept naar /api/admin/shop-ai/opslaan, met het adres van de foto en de bron, en nooit als zichtbaar", () => {
    const b = conceptBody({ ...klaar, imageUploadId: null, imageUrl: null, fotoUrl: "https://cdn.example/a.jpg", bronUrl: "https://leverancier.example/p" });
    expect(b).toMatchObject({ prijsCents: 1295, metFoto: false, fotoUrl: "https://cdn.example/a.jpg", bronUrl: "https://leverancier.example/p", inkoopCents: null });
    expect(b.concept).toMatchObject({ name: "Werkhandschoen Grip", category: "Werkdag", sizes: [], colors: [] });
    expect("active" in b).toBe(false);
  });
});

describe("het scherm", () => {
  it("gebruikt de bestaande routes, meldt fouten met role=alert en eerlijk over marktplaatsen, zonder window.alert", () => {
    const s = lees("components/admin/ShopNieuwStappen.tsx");
    for (const route of ["/api/admin/shop-ai/link", "/api/admin/shop-ai/concept", "/api/admin/shop-ai/opslaan", "/api/uploads", "/api/shop/products"]) expect(s, route).toContain(route);
    expect(s).toContain('role="alert"');
    expect(s).toContain("Grote marktplaatsen zoals AliExpress, Temu en Amazon laten hun pagina&apos;s niet door een programma lezen");
    expect(s).toContain("Bewaar als concept");
    expect(s).toContain("Zet in de winkel");
    expect(s).toContain("is een inkoopindicatie, geen verkoopprijs");
    expect(s).not.toMatch(/window\.alert|\balert\(/);
  });

  it("Product toevoegen in Beheer opent de drie stappen; Alle velden tonen opent het uitgebreide formulier; bewerken blijft het gewone formulier", () => {
    const a = lees("components/admin/ShopAdmin.tsx");
    expect(a).toContain("{tab === \"products\" && showForm && !editing && !uitgebreid && (");
    expect(a).toContain("<ShopNieuwStappen");
    expect(a).toContain("onAlleVelden={() => setUitgebreid(true)}");
    expect(a).toContain("showForm && (editing || uitgebreid) && (");
  });
});