import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { categorieTreffers, normaliseer, zoekScore, zoekSuggesties } from "@/lib/shop/zoeksuggesties";
import { BESTEL_VOOR_UUR, bezorgdagNaam, bezorgmoment, bezorgZin, isWerkdag, resterendTekst } from "@/lib/shop/bezorgmoment";
import { VERKOPER_VERZENDT_BINNEN_WERKDAGEN } from "@/lib/shop/verkoper-core";

// De webshop zoals bol.com, stap 1 (15 nov 2026): zoeksuggesties terwijl je typt, een aftellend bezorgmoment (werkdagen en
// feestdagen: niets beloven wat niet kan), een tabel
// met specificaties, en een betaaltekst die klopt met de kassa (er stond "beveiligd Stripe-betaalscherm" terwijl Stripe dicht is).

const lees = (f: string) => readFileSync(join(process.cwd(), f), "utf8").split("\r\n").join("\n");

const producten = [
  { name: "Werkhandschoen nitril", category: "Werk & PBM", description: "Grip bij nat werk" },
  { name: "Veiligheidsschoen S3", category: "Werk & PBM", description: "Stalen neus, waterdicht" },
  { name: "Hoodie ZekerFlex", category: "Kleding", description: "Zachte sweatstof" },
  { name: "Café-schort", category: "Kleding", description: "Voor de horeca" },
];

describe("zoeksuggesties", () => {
  it("negeert hoofdletters, accenten en dubbele spaties", () => {
    expect(normaliseer("  Café   SCHORT ")).toBe("cafe schort");
  });

  it("zoekt pas vanaf twee tekens", () => {
    expect(zoekSuggesties(producten, "w")).toEqual([]);
    expect(categorieTreffers([{ waarde: "Werk & PBM", label: "Werk & PBM" }], "w")).toEqual([]);
  });

  it("zet een naam die met de zoekvraag begint bovenaan", () => {
    const uit = zoekSuggesties(producten, "veilig").map((p) => p.name);
    expect(uit[0]).toBe("Veiligheidsschoen S3");
  });

  it("vindt ook op categorie en omschrijving, maar elk woord moet passen", () => {
    expect(zoekSuggesties(producten, "waterdicht").map((p) => p.name)).toEqual(["Veiligheidsschoen S3"]);
    expect(zoekSuggesties(producten, "cafe").map((p) => p.name)).toEqual(["Café-schort"]);
    expect(zoekScore(producten[0]!, "handschoen leer")).toBe(0);
  });

  it("geeft hooguit het gevraagde aantal", () => {
    expect(zoekSuggesties(producten, "werk", 1)).toHaveLength(1);
  });

  it("vindt categorieën op hun naam in de taal van de shop", () => {
    const cats = [
      { waarde: "Werk & PBM", label: "Werk & PBM" },
      { waarde: "Kleding", label: "Clothing" },
    ];
    expect(categorieTreffers(cats, "cloth")).toEqual([{ waarde: "Kleding", label: "Clothing" }]);
    expect(categorieTreffers(cats, "pbm").map((c) => c.waarde)).toEqual(["Werk & PBM"]);
  });
});

describe("bezorgmoment (Nederlandse tijd, werkdagen en feestdagen)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const T = { aftellen: "Bestel binnen {tijd}, {dag} in huis", nu: "Nu besteld, {dag} in huis", morgen: "morgen", uurEnMin: "{u} uur en {m} min", uren: "{u} uur", minuten: "{m} min" };
  /** de zin zoals de productpagina hem toont, met de klok bevroren op dit moment */
  const zin = (moment: string) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(moment));
    return bezorgZin(bezorgmoment(new Date()), T, "nl");
  };

  it("maandag 21:59: nog één minuut, morgen in huis", () => {
    expect(BESTEL_VOOR_UUR).toBe(22);
    expect(zin("2026-11-16T21:59:00+01:00")).toBe("Bestel binnen 1 min, morgen in huis");
  });

  it("vrijdagmiddag: vandaag weg, maar pas maandag in huis (in het weekend wordt niet bezorgd)", () => {
    expect(zin("2026-11-13T15:00:00+01:00")).toBe("Bestel binnen 7 uur, maandag in huis");
  });

  it("vrijdag 23:00: maandag weg, dinsdag in huis", () => {
    expect(zin("2026-11-13T23:00:00+01:00")).toBe("Nu besteld, dinsdag in huis");
  });

  it("zaterdag 15:00 en zondag 12:00: geen aftelling (er gaat niets weg), dinsdag in huis", () => {
    expect(zin("2026-11-14T15:00:00+01:00")).toBe("Nu besteld, dinsdag in huis");
    expect(zin("2026-11-15T12:00:00+01:00")).toBe("Nu besteld, dinsdag in huis");
    vi.setSystemTime(new Date("2026-11-14T15:00:00+01:00"));
    expect(bezorgmoment(new Date()).resterendMin).toBeNull();
  });

  it("dinsdag na 22:00: woensdag weg, donderdag in huis", () => {
    expect(zin("2026-11-17T22:00:00+01:00")).toBe("Nu besteld, donderdag in huis");
  });

  it("telt in de zomer (UTC+2) ook goed af", () => {
    expect(zin("2026-07-01T21:30:00+02:00")).toBe("Bestel binnen 30 min, morgen in huis");
  });

  it("slaat feestdagen over: kerst en Koningsdag", () => {
    // do 24 dec 23:00: 25 en 26 dec en het weekend gaat er niets weg; maandag 28 weg, dinsdag 29 in huis
    expect(zin("2026-12-24T23:00:00+01:00")).toBe("Nu besteld, dinsdag in huis");
    expect(bezorgmoment(new Date()).bezorgdag).toEqual({ year: 2026, month: 12, day: 29 });
    // ma 26 april 2027 15:00: vandaag weg, maar dinsdag 27 april is Koningsdag, dus woensdag in huis
    expect(zin("2027-04-26T15:00:00+02:00")).toBe("Bestel binnen 7 uur, woensdag in huis");
    expect(isWerkdag({ year: 2027, month: 3, day: 29 })).toBe(false); // tweede paasdag
    expect(isWerkdag({ year: 2027, month: 3, day: 30 })).toBe(true);
  });

  it("noemt in het Engels de dag ook bij naam", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T15:00:00+01:00"));
    expect(bezorgdagNaam(bezorgmoment(new Date()), "tomorrow", "en")).toBe("Tuesday");
  });

  it("schrijft de tijd uit in uren en minuten", () => {
    expect(resterendTekst(134, T)).toBe("2 uur en 14 min");
    expect(resterendTekst(120, T)).toBe("2 uur");
    expect(resterendTekst(45, T)).toBe("45 min");
  });

  it("een product van een verkoper krijgt geen aftelling, maar de echte termijn van de verkoper", () => {
    const pdp = lees("components/marketing/ProductDetail.tsx");
    expect(pdp).toMatch(/bezorg && variant && variantStock > 0 && !product\.seller/);
    expect(pdp).toMatch(/variantStock > 0 && product\.seller && \(/);
    expect(pdp).toContain("fmt(t.shop.bezorgVerkoper, { seller: product.seller, n: VERKOPER_VERZENDT_BINNEN_WERKDAGEN })");
    expect(VERKOPER_VERZENDT_BINNEN_WERKDAGEN).toBe(2);
    // ook het kaartje belooft niet altijd "morgen": de dag komt uit hetzelfde bezorgmoment
    const kaart = lees("components/marketing/ShopProductCard.tsx");
    expect(kaart).not.toContain("t.shop.deliveryTomorrow");
    expect(kaart).toContain("bezorgdagNaam(bezorg, t.shop.bezorgMorgen, locale)");
  });
});

describe("de shop zelf", () => {
  it("de productpagina zegt over betalen hetzelfde als de kassa", () => {
    const pdp = lees("components/marketing/ProductDetail.tsx");
    expect(pdp).toContain("useShopBetaalwijze()");
    expect(pdp).toContain("t.shop.bankPaymentNote");
    expect(pdp).toContain("t.shop.paymentClosedNote");
    // de Stripe-tekst alleen als er echt online betaald wordt
    expect(pdp.match(/t\.shop\.securePaymentNote/g)).toHaveLength(1);
    const chrome = lees("components/marketing/ShopChrome.tsx");
    expect(chrome).toContain("<ShopBetaalwijzeProvider waarde={betaalwijze}>");
  });

  it("het bezorgmoment wordt pas in de browser uitgerekend (geen hydratiefout)", () => {
    const pdp = lees("components/marketing/ProductDetail.tsx");
    expect(pdp).toContain("useBezorgmoment(30_000)");
    const hook = lees("components/marketing/useBezorgmoment.ts");
    expect(hook).toContain("useState<Bezorgmoment | null>(null)");
    expect(hook).toMatch(/useEffect\(\(\) => \{\n\s+setB\(bezorgmoment\(new Date\(\)\)\);/);
  });

  it("de productpagina heeft een tabel met specificaties en krijgt de collectie mee", () => {
    const pdp = lees("components/marketing/ProductDetail.tsx");
    expect(pdp).toContain("t.shop.specificaties");
    expect(pdp).toContain('scope="row"');
    expect(lees("app/shop/[slug]/page.tsx")).toContain("collection: p.collection ?? null");
  });

  it("de zoekbalk is een echte keuzelijst (toetsenbord en schermlezer) en werkt zonder JavaScript", () => {
    const chrome = lees("components/marketing/ShopChrome.tsx");
    expect(chrome).toContain('role="combobox"');
    expect(chrome).toContain('role="listbox"');
    expect(chrome).toContain("aria-activedescendant");
    expect(chrome).toContain('action="/shop#collectie" method="get"');
    expect(chrome).toContain('catalog={catalog}');
  });

  it("vaste teksten beloven geen 'morgen in huis' (geldt niet op vrijdagavond, in het weekend of op feestdagen)", () => {
    const nl = lees("lib/i18n/dictionaries.ts");
    const en = lees("lib/i18n/dictionary-en.ts");
    for (const k of ["inStock", "announcement", "uspNextDay", "deliveryTomorrow", "lowStock"]) {
      const nlRegel = nl.match(new RegExp(`\\n\\s+${k}: "([^"]*)"`))?.[1] ?? "";
      const enRegel = en.match(new RegExp(`\\n\\s+${k}: "([^"]*)"`))?.[1] ?? "";
      expect(nlRegel, k).not.toBe("");
      expect(nlRegel, k).not.toMatch(/morgen in huis/i);
      expect(enRegel, k).not.toMatch(/tomorrow/i);
    }
    expect(lees("app/shop/page.tsx")).not.toMatch(/morgen in huis/);
  });

  it("de zoeksuggesties halen de producten op bij het eerste klikken in de zoekbalk, ook met een lege winkelwagen", () => {
    const chrome = lees("components/marketing/ShopChrome.tsx");
    // ook het menu (stap 3) kan de catalogus vragen; de zoekbalk hoort er in elk geval bij
    expect(chrome).toMatch(/const needCatalog = count > 0 \|\| drawer \|\| zoekt\b/);
    expect(chrome.match(/onZoek=\{\(\) => setZoekt\(true\)\}/g)).toHaveLength(2);
    expect(chrome).toMatch(/setOpen\(true\);\n\s+onZoek\(\);/);
  });

  it("alle nieuwe teksten staan in het Nederlands én het Engels", () => {
    const nl = lees("lib/i18n/dictionaries.ts");
    const en = lees("lib/i18n/dictionary-en.ts");
    for (const k of ["zoekSuggesties", "zoekNaar", "inCategorie", "bezorgAftellen", "bezorgNu", "bezorgMorgen", "bezorgVerkoper", "opVoorraadDag", "specificaties", "specVerkoper", "doelUnisex"]) {
      expect(nl, k).toMatch(new RegExp(`\\b${k}: `));
      expect(en, k).toMatch(new RegExp(`\\b${k}: `));
    }
  });
});
