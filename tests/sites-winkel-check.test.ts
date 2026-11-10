import { describe, expect, it } from "vitest";
import { webshopPages, webshopTemplate } from "@/lib/sites/webshop-templates";
import { siteSaveSchema } from "@/lib/sites/schema";
import { LEGE_WINKEL, newBlock, type Block, type Company, type Page, type SiteProduct } from "@/lib/sites/types";
import { kortingPct, mediaan, metStandaardPagina, paginaIsLeeg, prijsUitschieters, winkelCheck, type CheckInvoer } from "@/lib/sites/winkel-check";

// Studio → Webshop → Slim → Winkelcheck: uit de echte gegevens van de webshop, zonder AI.
// Een complete winkel heeft geen punten en een score van 100; elk gat geeft één punt met een
// link of knop om het op te lossen.

const bedrijf: Company = { naam: "Bakkerij De Vries", kvk: "12345678", straat: "Dorpsstraat 1", postcode: "1234 AB", plaats: "Utrecht", telefoon: "030 1234567", email: "info@bakkerij.test" };

let teller = 0;
const id = () => `b${(teller++).toString(36).padStart(8, "0")}`;

const product = (over: Partial<SiteProduct> = {}): SiteProduct => ({
  id: "paaaaaaa1",
  naam: "Desembrood",
  slug: "desembrood",
  prijsCents: 450,
  oudePrijsCents: null,
  korteTekst: "Met een krokante korst",
  omschrijving: "Twee dagen gerezen met eigen zuurdesem, gebakken in een steenoven. Lekker bij soep of met alleen boter.",
  fotos: ["mfoto0001"],
  categorie: "Brood",
  zichtbaar: true,
  uitverkocht: false,
  ...over,
});

const vier = (): SiteProduct[] => [
  product(),
  product({ id: "pbbbbbbb2", naam: "Croissant", slug: "croissant", prijsCents: 195 }),
  product({ id: "pccccccc3", naam: "Appeltaart", slug: "appeltaart", prijsCents: 1450 }),
  product({ id: "pdddddddd4", naam: "Krentenbol", slug: "krentenbol", prijsCents: 95 }),
];

const invoer = (over: { producten?: SiteProduct[]; pages?: Page[]; bedrijf?: Partial<Company>; liveBuild?: string | null; bestellen?: boolean; betaalTekst?: string; unpublished?: boolean; canPublish?: boolean } = {}): CheckInvoer => ({
  site: {
    bedrijf: { ...bedrijf, ...over.bedrijf },
    pages: over.pages ?? webshopPages(webshopTemplate("algemeen"), bedrijf, id),
    media: [{ id: "mfoto0001", file: "mfoto0001.webp", width: 800, height: 800, alt: "", bron: "upload" }],
    liveBuild: over.liveBuild === undefined ? "build1" : over.liveBuild,
    winkel: { ...LEGE_WINKEL, producten: over.producten ?? vier(), bestellen: over.bestellen ?? true, betaalTekst: over.betaalTekst ?? LEGE_WINKEL.betaalTekst },
  },
  unpublished: over.unpublished ?? false,
  canPublish: over.canPublish ?? true,
});

const ids = (c: ReturnType<typeof winkelCheck>) => c.punten.map((p) => p.id);
const punt = (c: ReturnType<typeof winkelCheck>, pid: string) => c.punten.find((p) => p.id === pid);

describe("winkelCheck", () => {
  it("een complete webshop: geen punten, score 100", () => {
    const c = winkelCheck(invoer());
    expect(c.punten).toEqual([]);
    expect(c.score).toBe(100);
    expect(c.goed).toContain("Elk product heeft een foto.");
  });

  it("producten zonder foto, omschrijving of prijs, met een link naar elk product", () => {
    const c = winkelCheck(
      invoer({
        producten: [
          ...vier().slice(0, 3),
          product({ id: "peeeeeee5", naam: "Zonder alles", slug: "zonder-alles", fotos: [], omschrijving: "", prijsCents: 0 }),
          // een foto die niet (meer) bij de site hoort telt als geen foto
          product({ id: "pfffffff6", naam: "Weesfoto", slug: "weesfoto", fotos: ["mweg00001"], omschrijving: "Kort." }),
        ],
      }),
    );
    expect(punt(c, "geen-foto")?.producten.map((p) => p.id)).toEqual(["peeeeeee5", "pfffffff6"]);
    expect(punt(c, "geen-foto")?.titel).toBe("2 producten hebben geen foto");
    expect(punt(c, "geen-omschrijving")?.producten).toEqual([{ id: "peeeeeee5", naam: "Zonder alles", href: "/studio/webshop/producten/peeeeeee5" }]);
    expect(punt(c, "geen-omschrijving")?.actie).toEqual({ soort: "producttekst", label: "Laat de AI een tekst voorstellen" });
    expect(punt(c, "korte-omschrijving")?.status).toBe("let-op");
    expect(punt(c, "korte-omschrijving")?.producten.map((p) => p.id)).toEqual(["pfffffff6"]);
    expect(punt(c, "geen-prijs")?.titel).toBe("1 product heeft geen prijs");
    expect(c.score).toBeLessThan(100);
  });

  it("verborgen producten tellen niet mee voor foto of tekst, wel voor dubbele namen en adressen", () => {
    const c = winkelCheck(invoer({ producten: [...vier(), product({ id: "pggggggg7", naam: "desembrood ", slug: "desembrood", zichtbaar: false, fotos: [], omschrijving: "" })] }));
    expect(ids(c)).not.toContain("geen-foto");
    expect(punt(c, "dubbele-naam")?.producten.map((p) => p.id)).toEqual(["paaaaaaa1", "pggggggg7"]);
    expect(punt(c, "dubbel-adres")?.status).toBe("probleem");
  });

  it("uitverkocht maar zichtbaar, ook als de voorraad op 0 staat", () => {
    const c = winkelCheck(invoer({ producten: [...vier().slice(0, 3), product({ id: "phhhhhhh8", naam: "Taart", slug: "taart", voorraad: 0 })] }));
    expect(punt(c, "uitverkocht-zichtbaar")?.producten).toEqual([{ id: "phhhhhhh8", naam: "Taart", href: "/studio/webshop/producten/phhhhhhh8", extra: "voorraad 0" }]);
  });

  it("zonder producten online: één probleem, met een link naar wat verborgen staat", () => {
    const leeg = winkelCheck(invoer({ producten: [] }));
    expect(ids(leeg)).toEqual(["geen-producten"]);
    expect(punt(leeg, "geen-producten")?.actie).toEqual({ soort: "link", label: "Product toevoegen", href: "/studio/webshop/producten/nieuw" });
    const verborgen = winkelCheck(invoer({ producten: [product({ zichtbaar: false })] }));
    expect(punt(verborgen, "geen-producten")?.titel).toBe("Er staat geen product online (1 is verborgen)");
  });

  it("prijzen die op een typfout lijken en een vreemd hoge korting", () => {
    const c = winkelCheck(invoer({ producten: [...vier(), product({ id: "piiiiiii9", naam: "Brood typfout", slug: "brood-typfout", prijsCents: 45000 }), product({ id: "pjjjjjjj1", naam: "Stunt", slug: "stunt", prijsCents: 100, oudePrijsCents: 2000 })] }));
    expect(punt(c, "prijs-uitschieter")?.producten.map((p) => [p.id, p.extra])).toEqual([["piiiiiii9", "€ 450,00"]]);
    expect(punt(c, "korting-hoog")?.producten.map((p) => p.extra)).toEqual(["95% korting"]);
  });

  it("korte zin voor Google: ontbreekt of is te lang, en een naam die niet in de titel past", () => {
    const c = winkelCheck(invoer({ producten: [...vier().slice(0, 2), product({ id: "pkkkkkkk2", naam: "Zonder zin", slug: "zonder-zin", korteTekst: "" }), product({ id: "plllllll3", naam: "Een heel erg lange productnaam die nooit in de titel van Google past", slug: "lang", korteTekst: "x".repeat(170) })] }));
    expect(punt(c, "geen-korte-tekst")?.producten.map((p) => p.id)).toEqual(["pkkkkkkk2"]);
    expect(punt(c, "korte-tekst-lang")?.producten.map((p) => p.extra)).toEqual(["170 tekens"]);
    expect(punt(c, "titel-lang")?.producten.map((p) => p.id)).toEqual(["plllllll3"]);
  });

  it("de wettelijke pagina's: ontbreekt of leeg, met een knop voor de standaardpagina", () => {
    const pages = webshopPages(webshopTemplate("algemeen"), bedrijf, id).filter((p) => p.slug !== "verzenden-en-retourneren").map((p) => (p.slug === "voorwaarden" ? { ...p, blocks: [newBlock("tekst", id())] } : p));
    const c = winkelCheck(invoer({ pages }));
    expect(punt(c, "pagina-verzenden-en-retourneren")).toMatchObject({ status: "probleem", titel: "De pagina Verzenden en retourneren ontbreekt", actie: { soort: "pagina", slug: "verzenden-en-retourneren", label: "Standaardpagina toevoegen" } });
    expect(punt(c, "pagina-voorwaarden")).toMatchObject({ status: "let-op", titel: "De pagina Algemene voorwaarden is leeg", actie: { soort: "pagina", label: "Standaardtekst invullen" } });
  });

  it("bedrijfsgegevens die een webwinkel moet tonen", () => {
    const c = winkelCheck(invoer({ bedrijf: { kvk: "1234", plaats: "", email: "", telefoon: "" } }));
    expect(ids(c)).toEqual(["bedrijf-kvk", "bedrijf-adres", "bedrijf-email", "bedrijf-telefoon"]);
    expect(punt(c, "bedrijf-kvk")?.actie).toEqual({ soort: "link", label: "Naar je bedrijfsgegevens", href: "/studio/webshop/instellingen" });
  });

  it("niet online: publiceren als het mag, anders de weg naar Website-beheer", () => {
    expect(punt(winkelCheck(invoer({ liveBuild: null })), "niet-online")?.actie).toEqual({ soort: "publiceren", label: "Nu publiceren" });
    expect(punt(winkelCheck(invoer({ liveBuild: null, canPublish: false })), "niet-online")?.actie).toEqual({ soort: "link", label: "Online zetten met Website-beheer", href: "/werkgever/website" });
    expect(ids(winkelCheck(invoer({ unpublished: true })))).toEqual(["wijzigingen"]);
  });

  it("bestellen uit en geen betaaltekst", () => {
    expect(ids(winkelCheck(invoer({ bestellen: false })))).toEqual(["bestellen-uit"]);
    expect(ids(winkelCheck(invoer({ betaalTekst: " " })))).toEqual(["betaaltekst"]);
  });

  it("eerst de problemen, dan wat je moet nalopen; de score zakt naar hoeveel producten het raakt", () => {
    const c = winkelCheck(invoer({ bestellen: false, bedrijf: { kvk: "" } }));
    expect(c.punten.map((p) => p.status)).toEqual(["probleem", "let-op"]);
    const een = winkelCheck(invoer({ producten: [...vier().slice(0, 3), product({ id: "pmmmmmmm4", naam: "Kaal", slug: "kaal", fotos: [] })] }));
    const alle = winkelCheck(invoer({ producten: vier().map((p) => ({ ...p, fotos: [] })) }));
    expect(een.score).toBeGreaterThan(alle.score);
    expect(alle.score).toBeGreaterThanOrEqual(0);
  });
});

describe("hulpjes", () => {
  it("mediaan en prijsuitschieters (pas vanaf vier producten met een prijs)", () => {
    expect(mediaan([])).toBeNull();
    expect(mediaan([3, 1, 2])).toBe(2);
    expect(mediaan([1, 2, 3, 10])).toBe(2.5);
    expect(prijsUitschieters([...vier().slice(0, 2), product({ id: "pooooooo6", prijsCents: 999_999 })])).toEqual([]);
    expect(prijsUitschieters([...vier(), product({ id: "pnnnnnnn5", prijsCents: 3 })]).map((u) => u.product.id)).toEqual(["pnnnnnnn5"]);
  });

  it("korting alleen met een hogere was-prijs", () => {
    expect(kortingPct({ prijsCents: 750, oudePrijsCents: 1000 })).toBe(25);
    expect(kortingPct({ prijsCents: 1000, oudePrijsCents: 900 })).toBeNull();
    expect(kortingPct({ prijsCents: 1000, oudePrijsCents: null })).toBeNull();
  });

  it("een pagina is leeg zonder zichtbare tekst", () => {
    expect(paginaIsLeeg({ blocks: [newBlock("tekst", "b1")] })).toBe(true);
    const retour: Block = { id: "b2", type: "tekst", props: { kop: "Retour", tekst: "Je mag je bestelling binnen 14 dagen terugsturen." } };
    expect(paginaIsLeeg({ blocks: [{ ...retour, verborgen: true }] })).toBe(true);
    expect(paginaIsLeeg({ blocks: [retour] })).toBe(false);
  });
});

describe("metStandaardPagina", () => {
  const basis = () => webshopPages(webshopTemplate("algemeen"), bedrijf, id);

  it("een ontbrekende pagina komt vóór Contact, met de bedrijfsgegevens van nu, en de site blijft op te slaan", () => {
    const zonder = basis().filter((p) => p.slug !== "voorwaarden");
    const nieuw = metStandaardPagina(zonder, "voorwaarden", { ...bedrijf, kvk: "87654321" }, id);
    expect(nieuw?.map((p) => p.slug)).toEqual(["", "over-ons", "verzenden-en-retourneren", "voorwaarden", "contact"]);
    expect(JSON.stringify(nieuw?.find((p) => p.slug === "voorwaarden"))).toContain("KVK 87654321");
    const theme = { kleur: "#26313A", accent: "#3FC1A5", lettertype: "modern" as const, hoeken: "rond" as const };
    expect(siteSaveSchema.safeParse({ theme, bedrijf, pages: nieuw }).success).toBe(true);
  });

  it("een lege pagina krijgt de tekst; een pagina met tekst blijft zoals hij is", () => {
    const pages = basis().map((p) => (p.slug === "verzenden-en-retourneren" ? { ...p, titel: "Bezorgen", blocks: [] } : p));
    const gevuld = metStandaardPagina(pages, "verzenden-en-retourneren", bedrijf, id);
    const pagina = gevuld?.find((p) => p.slug === "verzenden-en-retourneren");
    expect(pagina?.titel).toBe("Bezorgen");
    expect(pagina && paginaIsLeeg(pagina)).toBe(false);
    expect(metStandaardPagina(basis(), "verzenden-en-retourneren", bedrijf, id)).toBeNull();
  });

  it("bij 12 pagina's komt er niets bij", () => {
    const vol = Array.from({ length: 12 }, (_, i): Page => ({ id: `p${i}`, slug: i ? `pagina-${i}` : "", titel: `Pagina ${i}`, seoTitel: "", seoOmschrijving: "", blocks: [] }));
    expect(metStandaardPagina(vol, "voorwaarden", bedrijf, id)).toBeNull();
  });
});
