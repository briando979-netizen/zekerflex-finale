import { describe, expect, it } from "vitest";
import { CHAT_START, chatStandaardAan, siteKennis } from "@/lib/sitechat/site-kennis";
import { LEGE_WINKEL, type SiteDoc } from "@/lib/sites/types";

const site: Pick<SiteDoc, "bedrijf" | "pages" | "winkel"> = {
  bedrijf: { naam: "Bakkerij Jansen", kvk: "12345678", straat: "Dorpsstraat 1", postcode: "1234 AB", plaats: "Utrecht", telefoon: "030 123 45 67", email: "info@example.com" },
  pages: [
    {
      id: "p1",
      slug: "",
      titel: "Welkom",
      seoTitel: "",
      seoOmschrijving: "",
      blocks: [
        { id: "b1", type: "hero", props: { kop: "Vers brood elke dag", tekst: "Ambachtelijk gebakken in Utrecht.", knop: "", knopLink: "", foto: null } },
        { id: "b2", type: "diensten", props: { kop: "Ons aanbod", items: [{ titel: "Taarten op maat", tekst: "Voor verjaardagen en bruiloften" }] } },
        { id: "b3", type: "openingstijden", props: { kop: "Open", regels: [{ dag: "Maandag t/m vrijdag", tijd: "07:00 – 18:00" }] } },
        { id: "b4", type: "faq", props: { kop: "Vragen", items: [{ vraag: "Bezorgen jullie?", antwoord: "Ja, in heel Utrecht." }, { vraag: "", antwoord: "leeg" }] } },
      ],
    },
    { id: "p2", slug: "over", titel: "Over ons", seoTitel: "", seoOmschrijving: "", blocks: [{ id: "b5", type: "tekst", props: { kop: "Sinds 1950", tekst: "Drie generaties bakkers." } }] },
  ],
  winkel: {
    ...LEGE_WINKEL,
    levering: { afhalen: true, bezorgen: true, bezorgkostenCents: 395, gratisVanafCents: 2500 },
    producten: [
      { id: "pa", naam: "Appeltaart", slug: "appeltaart", prijsCents: 1450, oudePrijsCents: null, korteTekst: "Met verse appels", omschrijving: "Voor 8 personen.", fotos: [], categorie: "Taart", zichtbaar: true, uitverkocht: false },
      { id: "pb", naam: "Geheim", slug: "geheim", prijsCents: 100, korteTekst: "", omschrijving: "", fotos: [], categorie: "", zichtbaar: false, uitverkocht: false },
    ],
  },
};

describe("siteKennis", () => {
  const k = siteKennis(site);
  const titels = k.fragmenten.map((f) => f.titel);

  it("noemt bedrijf, plaats en hoe je contact opneemt", () => {
    expect(k.bedrijf).toBe("Bakkerij Jansen");
    expect(k.omschrijving).toContain("uit Utrecht");
    expect(k.contact).toBe("bel 030 123 45 67");
    const contact = k.fragmenten.find((f) => f.titel === "Contact en adres");
    expect(contact?.altijd).toBe(true);
    expect(contact?.tekst).toContain("Dorpsstraat 1, 1234 AB Utrecht");
  });

  it("stuurt de openingstijden altijd mee", () => {
    expect(k.fragmenten.find((f) => f.titel === "Openingstijden")).toEqual({ titel: "Openingstijden", tekst: "Maandag t/m vrijdag: 07:00 – 18:00", altijd: true });
  });

  it("maakt van elke ingevulde vraag een eigen fragment", () => {
    expect(k.fragmenten.find((f) => f.titel === "Vraag: Bezorgen jullie?")?.tekst).toBe("Ja, in heel Utrecht.");
    expect(titels.filter((t) => t.startsWith("Vraag:"))).toHaveLength(1);
  });

  it("neemt de tekst van elke pagina mee", () => {
    expect(k.fragmenten.find((f) => f.titel === "Home (Welkom)")?.tekst).toContain("Taarten op maat: Voor verjaardagen en bruiloften.");
    expect(k.fragmenten.find((f) => f.titel === "Pagina Over ons")?.tekst).toContain("Drie generaties bakkers.");
  });

  it("neemt alleen zichtbare producten en de bezorgregels mee", () => {
    expect(k.fragmenten.find((f) => f.titel === "Product: Appeltaart")?.tekst).toContain("Prijs € 14,50.");
    expect(titels).not.toContain("Product: Geheim");
    expect(k.fragmenten.find((f) => f.titel.startsWith("Webwinkel"))?.tekst).toContain("Bezorgen kan voor € 3,95, gratis vanaf € 25,00.");
    expect(k.regels?.some((r) => r.includes("webwinkel"))).toBe(true);
  });

  it("valt terug op e-mail of het formulier zonder telefoonnummer", () => {
    expect(siteKennis({ ...site, bedrijf: { ...site.bedrijf, telefoon: "" } }).contact).toBe("mail info@example.com");
    expect(siteKennis({ ...site, bedrijf: { ...site.bedrijf, telefoon: "", email: "" } }).contact).toBe("gebruik het contactformulier op de website");
  });
});

describe("chatStandaardAan", () => {
  it("zet de chat alleen standaard aan voor sites die na de start zijn gemaakt", () => {
    expect(chatStandaardAan({ createdAt: CHAT_START })).toBe(true);
    expect(chatStandaardAan({ createdAt: "2026-11-01T10:00:00.000Z" })).toBe(false);
  });
});
