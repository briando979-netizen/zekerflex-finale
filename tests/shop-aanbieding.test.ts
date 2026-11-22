import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEAL_MAX_DAGEN, blackFridayWeek, controleerDeal, dealActief, geldendePrijsCents, historieDekt, kortingProcent, laagsteIn30Dagen, variantActiePrijs } from "@/lib/shop/aanbieding";

// Aanbiedingen in de webshop (18 nov 2026). De "van"-prijs is de laagste prijs van de 30 dagen vóór de aanbieding en
// komt uit de prijshistorie; niemand typt hem in. Een aanbieding is echt lager en heeft een einddatum.

const lees = (f: string) => readFileSync(join(process.cwd(), f), "utf8").split("\r\n").join("\n");
const nu = new Date("2026-11-20T12:00:00+01:00");
const dag = (n: number) => new Date(nu.getTime() + n * 86_400_000);

describe("de laagste prijs van de laatste 30 dagen", () => {
  it("neemt elke prijs in het venster mee, en de prijs die aan het begin van het venster al gold", () => {
    const log = [
      { priceCents: 5000, at: dag(-90) },
      { priceCents: 3000, at: dag(-60) }, // gold nog aan het begin van het venster
      { priceCents: 4500, at: dag(-20) },
      { priceCents: 4000, at: dag(-5) },
    ];
    expect(laagsteIn30Dagen(log, nu)).toBe(3000);
    // de prijs van 90 dagen terug telt niet meer: daarna kwam er een andere
    expect(laagsteIn30Dagen([{ priceCents: 1000, at: dag(-90) }, { priceCents: 4000, at: dag(-40) }, { priceCents: 4500, at: dag(-3) }], nu)).toBe(4000);
  });

  it("een eerdere aanbieding in het venster drukt de van-prijs: eerst verhogen en dan 'korting' geven werkt niet", () => {
    const log = [
      { priceCents: 4000, at: dag(-100) },
      { priceCents: 2500, at: dag(-25) }, // een eerdere aanbieding
      { priceCents: 6000, at: dag(-2) }, // net verhoogd
    ];
    expect(laagsteIn30Dagen(log, nu)).toBe(2500);
    expect(controleerDeal({ nieuwCents: 3900, laagste: laagsteIn30Dagen(log, nu), eindigt: dag(7), nu })).toBe("niet-lager");
  });

  it("zonder historie is er geen van-prijs, en een prijs uit de toekomst telt niet", () => {
    expect(laagsteIn30Dagen([], nu)).toBeNull();
    expect(laagsteIn30Dagen([{ priceCents: 100, at: dag(1) }], nu)).toBeNull();
  });
});

describe("genoeg historie", () => {
  it("de historie moet de volle 30 dagen dekken, ook voor een nieuw product", () => {
    // we houden de prijs pas 3 dagen bij: nog niet, wel over 27 dagen
    const kort = historieDekt(dag(-3), nu);
    expect(kort.dekt).toBe(false);
    expect(kort.vanaf?.getTime()).toBe(dag(27).getTime());
    expect(historieDekt(dag(-31), nu)).toEqual({ dekt: true, vanaf: null });
    // een product van 5 dagen oud kan niet meteen in de aanbieding met een prijs die niemand betaalde
    expect(historieDekt(dag(-5), nu).dekt).toBe(false);
    expect(historieDekt(null, nu)).toEqual({ dekt: false, vanaf: null });
  });

  it("zonder volledige historie geen aanbieding, hoe laag de prijs ook is", () => {
    expect(controleerDeal({ nieuwCents: 100, laagste: 4000, eindigt: dag(7), nu, historieVolledig: false })).toBe("historie-te-kort");
    expect(lees("lib/shop/aanbieding-server.ts")).toContain("historieVolledig: historie.dekt");
    // de database vult de beginstand zo dat alleen een nooit gewijzigd product historie sinds het aanmaken heeft
    expect(lees("prisma/migrations/20261118060000_shop_aanbieding/migration.sql")).toContain('CASE WHEN p."updatedAt" <= p."createdAt" + INTERVAL \'1 minute\' THEN p."createdAt" ELSE CURRENT_TIMESTAMP END');
    // geen vangnet in de triggers: een fout in de historie moet zichtbaar zijn, niet stil verdwijnen
    expect(lees("prisma/migrations/20261118060000_shop_aanbieding/migration.sql")).not.toContain("EXCEPTION");
    expect(lees("prisma/migrations/20261118060000_shop_aanbieding/migration.sql")).toContain("SET lock_timeout = '5s';");
  });
});

describe("regels voor een aanbieding", () => {
  const goed = { nieuwCents: 3200, laagste: 4000, eindigt: dag(7), nu };
  it("moet echt lager zijn, met een einddatum in de toekomst en niet te ver weg", () => {
    expect(controleerDeal(goed)).toBeNull();
    expect(controleerDeal({ ...goed, nieuwCents: 4000 })).toBe("niet-lager");
    expect(controleerDeal({ ...goed, nieuwCents: 3998 })).toBe("te-klein");
    expect(controleerDeal({ ...goed, laagste: null })).toBe("geen-historie");
    expect(controleerDeal({ ...goed, eindigt: dag(-1) })).toBe("eind-voorbij");
    expect(controleerDeal({ ...goed, eindigt: dag(DEAL_MAX_DAGEN + 1) })).toBe("eind-te-ver");
    expect(controleerDeal({ ...goed, nieuwCents: 0 })).toBe("prijs-ongeldig");
  });

  it("na de einddatum geldt de gewone prijs, ook als de actieprijs er nog staat", () => {
    const loopt = { priceCents: 3200, dealNormaalCents: 4000, dealEindigt: dag(1) };
    const voorbij = { priceCents: 3200, dealNormaalCents: 4000, dealEindigt: dag(-1) };
    expect(geldendePrijsCents(loopt, nu)).toBe(3200);
    expect(geldendePrijsCents(voorbij, nu)).toBe(4000);
    expect(geldendePrijsCents({ priceCents: 4000 }, nu)).toBe(4000);
    // een variant met een eigen prijs volgt zijn eigen gewone prijs; zonder eigen prijs die van het product
    expect(geldendePrijsCents(voorbij, nu, { priceCents: 3600, dealNormaalCents: 4500 })).toBe(4500);
    expect(geldendePrijsCents(loopt, nu, { priceCents: 3600, dealNormaalCents: 4500 })).toBe(3600);
    expect(geldendePrijsCents(voorbij, nu, { priceCents: null })).toBe(4000);
    // afrekenen en de AI-kassa gebruiken dit
    expect(lees("app/api/shop/orders/route.ts")).toContain("priceCents: geldendePrijsCents(v.product, nu, v),");
    expect(lees("app/api/shop/orders/route.ts")).toContain("await herstelVerlopenAanbiedingen(nu, true);");
    expect(lees("lib/shop/agent-handel-server.ts")).toContain("await herstelVerlopenAanbiedingen(new Date(), true);");
  });

  it("het percentage wordt naar beneden afgerond", () => {
    expect(kortingProcent(4000, 3200)).toBe(20);
    expect(kortingProcent(2995, 1999)).toBe(33);
    expect(kortingProcent(1000, 1000)).toBe(0);
    expect(kortingProcent(1000, 1200)).toBe(0);
  });

  it("een variant met een eigen prijs krijgt dezelfde korting", () => {
    expect(variantActiePrijs(5000, 4000, 3200)).toBe(4000);
    expect(variantActiePrijs(1, 4000, 3200)).toBe(1);
  });

  it("een aanbieding is zichtbaar tot de einddatum, en alleen met een hogere van-prijs", () => {
    expect(dealActief({ priceCents: 3200, dealVanCents: 4000, dealEindigt: dag(1) }, nu)).toBe(true);
    expect(dealActief({ priceCents: 3200, dealVanCents: 4000, dealEindigt: dag(1).toISOString() }, nu)).toBe(true);
    expect(dealActief({ priceCents: 3200, dealVanCents: 4000, dealEindigt: dag(-1) }, nu)).toBe(false);
    expect(dealActief({ priceCents: 3200, dealVanCents: 3200, dealEindigt: dag(1) }, nu)).toBe(false);
    expect(dealActief({ priceCents: 3200, dealVanCents: 4000, dealEindigt: null }, nu)).toBe(false);
    expect(dealActief({ priceCents: 3200 }, nu)).toBe(false);
  });

  it("Black Friday-week: maandag ervoor tot en met de maandag erna (2026: 23 t/m 30 november)", () => {
    expect(blackFridayWeek("2026-11-22")).toBe(false);
    expect(blackFridayWeek("2026-11-23")).toBe(true);
    expect(blackFridayWeek("2026-11-27")).toBe(true);
    expect(blackFridayWeek("2026-11-30")).toBe(true);
    expect(blackFridayWeek("2026-12-01")).toBe(false);
    expect(blackFridayWeek("2027-11-26")).toBe(true);
    expect(blackFridayWeek("onzin")).toBe(false);
  });
});

// "in de winkel" (etalage, banners en de prijs op de productpagina) is met de webshop op 22 nov 2026 weggehaald
describe("in beheer en op de server", () => {

  it("starten controleert tegen de historie en stoppen zet de gewone prijs terug", () => {
    const server = lees("lib/shop/aanbieding-server.ts");
    expect(server).toContain("const fout = controleerDeal({ nieuwCents: a.nieuwCents, laagste, eindigt: a.eindigt, nu, historieVolledig: historie.dekt });");
    expect(server).toContain("data: { priceCents: a.nieuwCents, dealVanCents: laagste, dealNormaalCents: product.priceCents, dealEindigt: a.eindigt }");
    expect(server).toContain("data: { priceCents: normaal, dealVanCents: null, dealNormaalCents: null, dealEindigt: null }");
  });

  it("de database houdt elke prijswijziging zelf bij, en wie de prijs wijzigt tijdens een aanbieding moet eerst stoppen", () => {
    const sql = lees("prisma/migrations/20261118060000_shop_aanbieding/migration.sql");
    expect(sql).toContain('AFTER INSERT OR UPDATE OF "priceCents" ON "ShopProduct"');
    expect(sql).toContain('AFTER INSERT OR UPDATE OF "priceCents" ON "ShopProductVariant"');
    // alleen toevoegen (het commentaar bovenaan beschrijft het terugdraaien en telt niet mee)
    const opdrachten = sql.split("\n").filter((r) => !r.startsWith("--")).join("\n");
    expect(opdrachten).not.toMatch(/^\s*(DROP|DELETE|TRUNCATE) /m);
    expect(lees("app/api/shop/products/[id]/route.ts")).toContain("nu.dealNormaalCents !== null && nu.priceCents !== data.priceCents");
  });

  it("alle nieuwe teksten staan in het Nederlands én het Engels", () => {
    const nl = lees("lib/i18n/dictionaries.ts");
    const en = lees("lib/i18n/dictionary-en.ts");
    for (const k of ["aanbiedingen", "dealVan", "dealLaagste"]) {
      expect(nl, k).toMatch(new RegExp(`\\n\\s+${k}: "`));
      expect(en, k).toMatch(new RegExp(`\\n\\s+${k}: "`));
    }
  });
});
