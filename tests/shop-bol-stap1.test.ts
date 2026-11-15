import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { categorieTreffers, normaliseer, zoekScore, zoekSuggesties } from "@/lib/shop/zoeksuggesties";
import { BESTEL_VOOR_UUR, bezorgmoment, resterendTekst } from "@/lib/shop/bezorgmoment";

// De webshop zoals bol.com, stap 1 (15 nov 2026): zoeksuggesties terwijl je typt, een aftellend bezorgmoment, een tabel
// met specificaties, en een betaaltekst die klopt met de kassa (er stond "beveiligd Stripe-betaalscherm" terwijl Stripe dicht is).

const lees = (f: string) => readFileSync(join(process.cwd(), f), "utf8");

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

describe("bezorgmoment (Nederlandse tijd, niet die van de server)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("telt af tot het grensuur in de winter (UTC+1)", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-15T19:46:00+01:00"));
    expect(BESTEL_VOOR_UUR).toBe(22);
    expect(bezorgmoment(new Date())).toEqual({ dag: "morgen", resterendMin: 134 });
  });

  it("telt af tot het grensuur in de zomer (UTC+2)", () => {
    expect(bezorgmoment(new Date("2026-07-01T21:30:00+02:00"))).toEqual({ dag: "morgen", resterendMin: 30 });
  });

  it("na het grensuur wordt het overmorgen", () => {
    expect(bezorgmoment(new Date("2026-11-15T22:00:00+01:00")).dag).toBe("overmorgen");
    expect(bezorgmoment(new Date("2026-11-15T23:59:00+01:00")).dag).toBe("overmorgen");
  });

  it("vlak na middernacht telt hij weer de hele dag af", () => {
    expect(bezorgmoment(new Date("2026-11-16T00:10:00+01:00"))).toEqual({ dag: "morgen", resterendMin: 21 * 60 + 50 });
  });

  it("schrijft de tijd uit in uren en minuten", () => {
    const t = { uurEnMin: "{u} uur en {m} min", uren: "{u} uur", minuten: "{m} min" };
    expect(resterendTekst(134, t)).toBe("2 uur en 14 min");
    expect(resterendTekst(120, t)).toBe("2 uur");
    expect(resterendTekst(45, t)).toBe("45 min");
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
    expect(pdp).toContain("useState<Date | null>(null)");
    expect(pdp).toMatch(/nu && variant && variantStock > 0 && !product\.seller/);
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

  it("alle nieuwe teksten staan in het Nederlands én het Engels", () => {
    const nl = lees("lib/i18n/dictionaries.ts");
    const en = lees("lib/i18n/dictionary-en.ts");
    for (const k of ["zoekSuggesties", "zoekNaar", "inCategorie", "bezorgAftellen", "bezorgOvermorgen", "specificaties", "specVerkoper", "doelUnisex"]) {
      expect(nl, k).toMatch(new RegExp(`\\b${k}: `));
      expect(en, k).toMatch(new RegExp(`\\b${k}: `));
    }
  });
});
