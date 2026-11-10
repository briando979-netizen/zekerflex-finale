import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bestelMail } from "@/lib/sites/bestellingen";
import { somRegels } from "@/lib/sites/bestel-som";
import { renderWinkelPagina } from "@/lib/sites/render";
import { LEGE_WINKEL, newBlock, type SiteDoc, type SiteProduct, type Winkel } from "@/lib/sites/types";
import { berekenBestelling, leesBestelForm, type BestelInvoer } from "@/lib/sites/winkel";
import { mandVerzendTekst } from "@/lib/sites/winkel-render";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

// Afrekenen in de webshop (10 nov 2026): de klant kiest verzending en betaling en vult een
// kortingscode in; de server rekent alles opnieuw uit met de prijzen en regels van de winkel.

const product = (over: Partial<SiteProduct> = {}): SiteProduct => ({
  id: "pbrood0001",
  naam: "Desembrood",
  slug: "desembrood",
  prijsCents: 450,
  korteTekst: "",
  omschrijving: "",
  fotos: [],
  categorie: "",
  zichtbaar: true,
  uitverkocht: false,
  ...over,
});

const winkel = (over: Partial<Winkel> = {}): Winkel => ({
  ...LEGE_WINKEL,
  producten: [product({ btw: 9 }), product({ id: "ptas000001", naam: "Linnen tas", slug: "tas", prijsCents: 1000 })],
  verzendmethoden: [
    { id: "vafhaal01", soort: "afhalen", naam: "Afhalen in de winkel", prijsCents: 0, gratisVanafCents: null, gebied: "nl", adres: "", levertijd: "Morgen klaar", actief: true },
    { id: "vpostnl01", soort: "bezorgen", naam: "PostNL", prijsCents: 495, gratisVanafCents: 5000, gebied: "eu", adres: "", levertijd: "1 tot 2 werkdagen", actief: true },
  ],
  kortingscodes: [{ id: "kzomer001", code: "ZOMER10", soort: "procent", waarde: 10, minimumCents: 1000, totEnMet: "2026-12-31", maxGebruik: 50, actief: true }],
  betalen: { methoden: ["afhalen", "overboeking", "rembours"], iban: "NL91ABNA0417164300", tenaamstelling: "Bakkerij Jansen" },
  btw: { inclusief: true, standaard: 21, kor: false },
  ...over,
});

const invoer = (over: Partial<BestelInvoer> = {}): BestelInvoer => ({
  aantallen: { pbrood0001: 2, ptas000001: 1 },
  keuzes: {},
  levering: "afhalen",
  naam: "Sanne de Vries",
  email: "sanne@example.test",
  telefoon: "06 12345678",
  straat: "",
  postcode: "",
  plaats: "",
  opmerking: "",
  verzend: "vafhaal01",
  betaalmethode: "afhalen",
  ...over,
});

const adres = { straat: "Dorpsstraat 1", postcode: "1234 AB", plaats: "Zonnedorp" };

describe("afrekenen: rekenen", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-10T12:00:00+01:00"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("rekent korting, verzending en btw per tarief, alles met de prijzen van de winkel", () => {
    const r = berekenBestelling(winkel(), invoer({ verzend: "vpostnl01", betaalmethode: "overboeking", kortingscode: "zomer10", ...adres }), { kortingGebruikt: 3 });
    expect(r.fouten).toEqual([]);
    const c = r.concept!;
    expect(c.subtotaalCents).toBe(1900);
    expect(c.korting).toEqual({ id: "kzomer001", code: "ZOMER10", cents: 190 });
    expect(c.bezorgkostenCents).toBe(495);
    expect(c.totaalCents).toBe(1900 - 190 + 495);
    // korting naar verhouding: 900 → 810 (9%), 1000 → 900 (21%); verzending 495 naar verhouding 810:900
    expect(c.btw?.regels.map((x) => x.tarief)).toEqual([21, 9]);
    expect(c.btw!.regels.reduce((a, x) => a + x.grondslagCents + x.btwCents, 0)).toBe(c.totaalCents);
    expect(c.verzending).toMatchObject({ id: "vpostnl01", soort: "bezorgen", naam: "PostNL", land: "Nederland" });
    expect(c.betaalmethode).toBe("overboeking");
    expect(c.rekening).toEqual({ iban: "NL91ABNA0417164300", naam: "Bakkerij Jansen" });
    expect(c.regels.map((x) => x.btw)).toEqual([9, 21]);
  });

  it("is gratis vanaf de grens na korting, en rekent exclusief de btw erbij", () => {
    const veel = invoer({ aantallen: { ptas000001: 5 }, verzend: "vpostnl01", betaalmethode: "overboeking", ...adres });
    expect(berekenBestelling(winkel(), veel).concept?.bezorgkostenCents).toBe(0);
    // met 10% korting is het 4500 aan producten: dan wel verzendkosten
    expect(berekenBestelling(winkel(), { ...veel, kortingscode: "ZOMER10" }).concept?.bezorgkostenCents).toBe(495);
    const excl = berekenBestelling(winkel({ btw: { inclusief: false, standaard: 21, kor: false } }), invoer({ aantallen: { ptas000001: 1 } })).concept!;
    expect(excl.totaalCents).toBe(1210);
    expect(somRegels(excl).map((x) => `${x.label}: ${x.bedrag}`)).toEqual(["Subtotaal (excl. btw): € 10,00", "Afhalen in de winkel: Gratis", "Btw 21%: € 2,10", "Totaal: € 12,10"]);
  });

  it("geeft duidelijke fouten bij een onbekende, verlopen of te lage kortingscode", () => {
    expect(berekenBestelling(winkel(), invoer({ kortingscode: "WINTER" })).fouten).toEqual(["De kortingscode WINTER kennen we niet. Controleer de code, of haal hem weg."]);
    expect(berekenBestelling(winkel(), invoer({ aantallen: { pbrood0001: 1 }, kortingscode: "ZOMER10" })).fouten).toEqual(["De kortingscode ZOMER10 geldt vanaf € 10,00 aan producten. Je bestelling is nu € 4,50."]);
    expect(berekenBestelling(winkel(), invoer({ kortingscode: "ZOMER10" }), { kortingGebruikt: 50 }).fouten).toEqual(["De kortingscode ZOMER10 is al zo vaak gebruikt als kon."]);
    vi.setSystemTime(new Date("2027-01-01T08:00:00+01:00"));
    expect(berekenBestelling(winkel(), invoer({ kortingscode: "ZOMER10" })).fouten).toEqual(["De kortingscode ZOMER10 is verlopen."]);
  });

  it("laat betalen bij afhalen niet toe bij bezorgen, en bezorgt alleen in het eigen gebied", () => {
    expect(berekenBestelling(winkel(), invoer({ verzend: "vpostnl01", ...adres })).fouten).toEqual([
      "Betalen bij afhalen kan alleen als je de bestelling afhaalt. Kies een andere manier van betalen of van verzenden.",
    ]);
    expect(berekenBestelling(winkel(), invoer({ betaalmethode: "rembours" })).fouten[0]).toMatch(/^Contant bij bezorgen kan alleen/);
    expect(berekenBestelling(winkel(), invoer({ verzend: "vpostnl01", betaalmethode: "overboeking", land: "ZZ", landAnders: "Noorwegen", ...adres })).fouten).toEqual(["PostNL bezorgt niet in Noorwegen. Kies een andere verzendmethode of een ander land."]);
    const be = berekenBestelling(winkel(), invoer({ verzend: "vpostnl01", betaalmethode: "overboeking", land: "BE", ...adres })).concept;
    expect(be?.verzending?.land).toBe("België");
    expect(berekenBestelling(winkel(), invoer({ verzend: "vweg00001" })).fouten).toEqual(["Die verzendmethode is er niet meer. Kies een andere."]);
    expect(berekenBestelling(winkel(), invoer({ betaalmethode: "" })).fouten).toEqual(["Kies hoe je wilt betalen."]);
  });

  it("neemt nooit een bedrag uit het formulier over", () => {
    const form = new FormData();
    form.set("n_ptas000001", "1");
    form.set("verzend", "vpostnl01");
    form.set("bezorgkostenCents", "0");
    form.set("totaalCents", "1");
    form.set("kortingscode", " zomer 10 ");
    form.set("land", "be");
    const i = leesBestelForm(form);
    expect(i).toMatchObject({ verzend: "vpostnl01", kortingscode: "ZOMER10", land: "BE" });
    expect(Object.keys(i)).not.toContain("totaalCents");
  });

  it("rekent een oude winkel zonder instellingen precies zoals vroeger", () => {
    const oud: Winkel = { ...LEGE_WINKEL, producten: [product()], levering: { afhalen: true, bezorgen: true, bezorgkostenCents: 395, gratisVanafCents: 2500 } };
    const c = berekenBestelling(oud, { ...invoer({ aantallen: { pbrood0001: 2 }, levering: "bezorgen", ...adres }), verzend: "", betaalmethode: "" }).concept!;
    expect([c.subtotaalCents, c.bezorgkostenCents, c.totaalCents]).toEqual([900, 395, 1295]);
    expect(c.btw).toBeUndefined();
    expect(c.betaalmethode).toBeUndefined();
    expect(mandVerzendTekst(oud, 900)).toBe("Nog € 16,00 tot gratis bezorgen.");
  });
});

const site = (w: Winkel): Pick<SiteDoc, "pages" | "media" | "theme" | "bedrijf" | "voorbeeld" | "voorstel" | "winkel"> => ({
  pages: [{ id: "home", slug: "", titel: "Home", seoTitel: "", seoOmschrijving: "", blocks: [{ ...newBlock("producten", "b1") }] }],
  media: [],
  theme: { kleur: "#3B2A1E", accent: "#D4A24C", lettertype: "klassiek", hoeken: "rond", stijl: "premium" },
  bedrijf: { naam: "Bakkerij Jansen", kvk: "", straat: "Molenweg 4", postcode: "1234 AB", plaats: "Zonnedorp", telefoon: "", email: "" },
  winkel: w,
});
const opts = { root: "/site/bakker/", origin: "https://zekerflex.com" };

describe("afrekenen: de pagina's", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-10T12:00:00+01:00"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("laat op het bestelformulier verzending, land, betalen en een kortingscode kiezen, zonder scripts", () => {
    const html = renderWinkelPagina(site(winkel()), { soort: "bestellen" }, opts) ?? "";
    expect(html).toContain('<input type="radio" name="verzend" value="vafhaal01" checked>');
    expect(html).toContain("€ 4,95, gratis vanaf € 50,00");
    expect(html).toContain("Molenweg 4, 1234 AB Zonnedorp · Morgen klaar");
    expect(html).toContain('<select class="osel" name="land" autocomplete="country"><option value="NL" selected>Nederland</option>');
    expect(html).toContain('name="betaalmethode" value="overboeking"');
    expect(html).toContain('<span class="vnaam">Contant bij bezorgen</span>');
    expect(html).toContain('name="kortingscode"');
    expect(html).not.toMatch(/<script(?! type="application\/ld\+json")/);
  });

  it("toont op de controlepagina korting, verzending en btw, en stuurt de keuzes verborgen mee", () => {
    const c = berekenBestelling(winkel(), invoer({ verzend: "vpostnl01", betaalmethode: "overboeking", kortingscode: "ZOMER10", ...adres })).concept!;
    const html = renderWinkelPagina(site(winkel()), { soort: "controle", concept: c }, opts) ?? "";
    expect(html).toContain("<td>Korting (ZOMER10)</td><td>− € 1,90</td>");
    expect(html).toContain("<td>PostNL</td><td>€ 4,95</td>");
    expect(html).toContain('<tr class="sklein"><td>Waarvan btw 21%</td>');
    expect(html).toContain('<input type="hidden" name="kortingscode" value="ZOMER10">');
    expect(html).toContain('<input type="hidden" name="verzend" value="vpostnl01">');
    expect(html).toContain("PostNL: bezorgen op Dorpsstraat 1, 1234 AB Zonnedorp.");
    expect(html).toContain("<strong>Betalen:</strong> Overboeking.");
  });

  it("toont na een overboeking het bedrag, de rekening, het bestelnummer en de QR-code", () => {
    const c = berekenBestelling(winkel(), invoer({ betaalmethode: "overboeking" })).concept!;
    const { invoer: _weg, ...bestelling } = c;
    void _weg;
    const html = renderWinkelPagina(site(winkel()), { soort: "besteld", nr: "K7M3Q2", info: { bestelling, qr: '<svg aria-label="qr"></svg>' } }, opts) ?? "";
    expect(html).toContain("<h2>Zo betaal je</h2>");
    expect(html).toContain("<dt>IBAN</dt><dd>NL91 ABNA 0417 1643 00</dd>");
    expect(html).toContain("<dt>Omschrijving</dt><dd>K7M3Q2</dd>");
    expect(html).toContain(`<dt>Bedrag</dt><dd>€ 19,00</dd>`);
    expect(html).toContain('<figure class="betaal-qr"><svg aria-label="qr"></svg>');
    expect(html).not.toContain("Sanne");
    const afhalen = renderWinkelPagina(site(winkel()), { soort: "besteld", nr: "K7M3Q2", info: { bestelling: { ...bestelling, betaalmethode: "afhalen" }, qr: null } }, opts) ?? "";
    expect(afhalen).toContain("je betaalt € 19,00 bij het afhalen.");
  });

  it("zet in de mail aan het bedrijf verzending, korting, btw en wat er met de betaling moet", () => {
    const c = berekenBestelling(winkel(), invoer({ verzend: "vpostnl01", betaalmethode: "overboeking", kortingscode: "ZOMER10", land: "BE", ...adres })).concept!;
    const mail = bestelMail(c, "K7M3Q2", "https://zekerflex.com/site/bakker", "Molenweg 4, 1234 AB Zonnedorp");
    expect(mail).toContain("Korting (ZOMER10)  − € 1,90");
    expect(mail).toContain("PostNL  € 4,95");
    expect(mail).toContain("Waarvan btw 9%");
    expect(mail).toContain("Verzending: PostNL (1 tot 2 werkdagen)");
    expect(mail).toContain("Bezorgen op: Dorpsstraat 1, 1234 AB Zonnedorp, België");
    expect(mail).toContain("De klant maakt € 22,05 over met omschrijving K7M3Q2.");
    const afhaal = bestelMail(berekenBestelling(winkel(), invoer()).concept!, "K7M3Q2", "x", "Molenweg 4, 1234 AB Zonnedorp");
    expect(afhaal).toContain("De klant haalt de bestelling af (Molenweg 4, 1234 AB Zonnedorp).");
  });
});
