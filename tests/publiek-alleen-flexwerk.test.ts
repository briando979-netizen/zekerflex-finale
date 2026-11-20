import { describe, expect, it, vi, beforeEach } from "vitest";

// Vlag `publiek-alleen-flexwerk` (lib/marketing/flexwerk-only.ts): als hij AAN staat, is de openbare site alleen flexwerk.
// De bestaande tests draaien met de vlag UIT (de standaard) en blijven groen; dit bestand controleert de AAN-situatie.
// De vlag is mockbaar via @/lib/flags (featureEnabled).

const h = vi.hoisted(() => ({ vlagAan: false }));

// de sitemap leest inline prisma.shopProduct.findMany (buiten de .catch), dus die moet een functie zijn; de rest zit achter .catch
vi.mock("@/lib/prisma", () => ({ prisma: { shopProduct: { findMany: async () => [] } } }));
vi.mock("@/lib/nieuws/store", () => ({ geplaatsteBerichten: async () => [] }));
vi.mock("@/lib/flags", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/flags")>();
  return { ...actual, featureEnabled: async (key: string) => (key === "publiek-alleen-flexwerk" ? h.vlagAan : false) };
});

import {
  FLAG_ALLEEN_FLEXWERK,
  isNietFlexwerkPad,
  NIET_FLEXWERK_NAV_KEYS,
  NIET_FLEXWERK_PIJLERS,
  pijlerIsFlexwerk,
  werkruimteIsFlexwerk,
  zichtbarePijlers,
} from "@/lib/marketing/flexwerk-only";
import { AANBOD_KOLOMMEN, NAV, zichtbareAanbodKolommen, zichtbareNav } from "@/lib/marketing/site-nav";
import { PIJLERS } from "@/lib/marketing/aanbod";
import { WERKRUIMTES } from "@/lib/werkgever/werkruimte";
import { uitbreidingen } from "@/lib/abonnement/overzicht";
import { openbareRoutes } from "@/lib/ops/rondgang";
import { robotsVerborgen } from "@/lib/seo/verbergen";

beforeEach(() => {
  h.vlagAan = false;
});

describe("publiek = alleen flexwerk: de bron van waarheid", () => {
  it("de vlag heet precies publiek-alleen-flexwerk", () => {
    expect(FLAG_ALLEEN_FLEXWERK).toBe("publiek-alleen-flexwerk");
  });

  it("alleen online en branche zijn geen flexwerk; personeel en geld wel", () => {
    expect([...NIET_FLEXWERK_PIJLERS].sort()).toEqual(["branche", "online"]);
    expect(pijlerIsFlexwerk("personeel")).toBe(true);
    expect(pijlerIsFlexwerk("geld")).toBe(true);
    expect(pijlerIsFlexwerk("online")).toBe(false);
    expect(pijlerIsFlexwerk("branche")).toBe(false);
  });

  it("de niet-flexwerk-pagina's worden herkend, de flexwerk-pagina's niet", () => {
    for (const p of [
      "/shop",
      "/shop/paskamer",
      "/shop/een-of-ander-product",
      "/producten",
      "/producten/recruitflex-ai",
      "/apps",
      "/apps-en-spelletjes",
      "/online",
      "/website-maken",
      "/website-check",
      "/logo-maker",
      "/advertentie-op-maat",
      "/starters",
      "/domeinnaam",
      "/review-check",
      "/rijschool-software",
      "/verkopen",
      "/developers",
      "/developers/api",
      "/aanbod/website", // online-pijler, eigen /aanbod-pagina
      "/aanbod/webshop",
      "/aanbod/horeca", // branche-pijler
    ]) {
      expect(isNietFlexwerkPad(p), p).toBe(true);
    }
    for (const p of [
      "/",
      "/klussen",
      "/uitzendbureau",
      "/voor-bedrijven",
      "/voor-freelancers",
      "/prijzen",
      "/aanbod", // het hele-aanbod-overzicht blijft (flexwerk)
      "/aanbod/flexwerkers-inhuren", // personeel-pijler
      "/rekentools", // flexwerk-rekentools blijven
      "/rekentools/btw-nummer-check",
      "/kennis",
      "/over-ons",
      "/horeca-vacatures", // flexwerk: horeca-WERK, geen software
      "/nieuws",
    ]) {
      expect(isNietFlexwerkPad(p), p).toBe(false);
    }
  });
});

describe("het hoofdmenu met de vlag aan", () => {
  it("zonder vlag is het menu ongewijzigd (shop en apps blijven)", () => {
    const keys = zichtbareNav(NAV, false).map((n) => n.key);
    expect(keys).toContain("shop");
    expect(keys).toContain("apps");
    expect(zichtbareNav(NAV, false)).toBe(NAV);
  });

  it("met de vlag aan vallen shop en apps uit de bovenbalk", () => {
    const keys = zichtbareNav(NAV, true).map((n) => n.key);
    for (const weg of NIET_FLEXWERK_NAV_KEYS) expect(keys, weg).not.toContain(weg);
    // de flexwerk-knoppen blijven
    expect(keys).toContain("aanbod");
    expect(keys).toContain("prijzen");
    expect(keys).toContain("kennis");
  });

  it("de Aanbod-uitklap toont zonder vlag vier pijlers, met de vlag aan alleen personeel en geld", () => {
    expect(zichtbareAanbodKolommen(false).map((k) => k.sleutel)).toEqual(AANBOD_KOLOMMEN.map((k) => k.sleutel));
    expect(zichtbareAanbodKolommen(true).map((k) => k.sleutel)).toEqual(["personeel", "geld"]);
  });

  it("zichtbarePijlers filtert de pijlers op dezelfde manier", () => {
    expect(zichtbarePijlers(PIJLERS, false).map((p) => p.sleutel)).toEqual(PIJLERS.map((p) => p.sleutel));
    expect(zichtbarePijlers(PIJLERS, true).map((p) => p.sleutel)).toEqual(["personeel", "geld"]);
  });
});

describe("de nachtelijke rondgang met de vlag aan", () => {
  it("zonder vlag staan de niet-flexwerk-pagina's gewoon in de rondgang", () => {
    const routes = openbareRoutes(undefined, false);
    expect(routes).toContain("/online");
    expect(routes).toContain("/shop");
  });

  it("met de vlag aan vallen de verborgen pagina's uit de rondgang, de flexwerk-pagina's blijven", () => {
    const routes = openbareRoutes(undefined, true);
    for (const weg of ["/online", "/shop", "/developers", "/website-maken", "/apps-en-spelletjes", "/rijschool-software"]) {
      expect(routes, weg).not.toContain(weg);
    }
    expect(routes).toContain("/uitzendbureau");
    expect(routes).toContain("/prijzen");
  });
});

describe("noindex op een verborgen pagina", () => {
  it("zonder vlag krijgt een verborgen pagina geen robots-metadata", async () => {
    h.vlagAan = false;
    expect(await robotsVerborgen("/online")).toEqual({});
  });

  it("met de vlag aan komt een verborgen pagina op noindex (links volgen mag)", async () => {
    h.vlagAan = true;
    expect(await robotsVerborgen("/online")).toEqual({ robots: { index: false, follow: true } });
    expect(await robotsVerborgen("/shop")).toEqual({ robots: { index: false, follow: true } });
    // /verkopen (webshop-verkooppartner) ook op noindex
    expect(await robotsVerborgen("/verkopen")).toEqual({ robots: { index: false, follow: true } });
    expect(await robotsVerborgen("/verkopen/start")).toEqual({ robots: { index: false, follow: true } });
  });

  it("een flexwerk-pagina blijft indexeerbaar, ook met de vlag aan", async () => {
    h.vlagAan = true;
    expect(await robotsVerborgen("/klussen")).toEqual({});
    expect(await robotsVerborgen("/aanbod")).toEqual({});
  });
});

describe("de bedrijfskant met de vlag aan", () => {
  it("alleen personeel is een flexwerk-werkruimte", () => {
    expect(werkruimteIsFlexwerk("personeel")).toBe(true);
    for (const s of ["website", "webshop", "horeca", "rijschool"]) expect(werkruimteIsFlexwerk(s), s).toBe(false);
  });

  it("de aanmelding/dashboard-keuze toont met de vlag aan alleen personeel", () => {
    // waar RegisterForm, WerkruimteKiezer en DashboardWisselaar op filteren
    expect(WERKRUIMTES.filter(werkruimteIsFlexwerk)).toEqual(["personeel"]);
  });

  it("een bestaand bedrijf houdt zijn open niet-flexwerk-dashboard in de wisselaar (bereikbaar, geen 404)", () => {
    // de wisselaar/kiezer toont: flexwerk OF het open dashboard, zodat een horecazaak haar dashboard houdt
    const actief = "horeca";
    const getoond = WERKRUIMTES.filter((w) => werkruimteIsFlexwerk(w) || w === actief);
    expect(getoond).toContain("horeca");
    expect(getoond).toContain("personeel");
    expect(getoond).not.toContain("webshop");
  });

  it("uitbreidingen: met de vlag aan alleen de flexwerk-pijlers; zonder de vlag alle", () => {
    const alle = uitbreidingen(false).map((g) => g.pijler);
    for (const niet of NIET_FLEXWERK_PIJLERS) expect(alle, niet).toContain(niet);
    const flex = uitbreidingen(true).map((g) => g.pijler);
    for (const niet of NIET_FLEXWERK_PIJLERS) expect(flex, niet).not.toContain(niet);
    expect(flex).toContain("personeel");
  });
});

describe("de sitemap met de vlag aan", () => {
  async function bouwSitemap(): Promise<{ url: string }[]> {
    const mod = await import("@/app/sitemap");
    // de sitemap heeft een eigen geheugencache van tien minuten; leeg hem zodat de vlagwaarde telt
    const g = globalThis as typeof globalThis & { __zfSitemap?: { sitemap?: unknown } };
    if (g.__zfSitemap) g.__zfSitemap.sitemap = undefined;
    return (await mod.default()) as { url: string }[];
  }

  it("zonder vlag staan de niet-flexwerk-pagina's in de sitemap", async () => {
    h.vlagAan = false;
    const urls = (await bouwSitemap()).map((r) => r.url);
    expect(urls.some((u) => u.endsWith("/online"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/shop"))).toBe(true);
  });

  it("met de vlag aan vallen de verborgen pagina's uit de sitemap, de flexwerk-pagina's blijven", async () => {
    h.vlagAan = true;
    const urls = (await bouwSitemap()).map((r) => r.url);
    const padVan = (u: string) => u.replace(/^https?:\/\/[^/]+/, "");
    for (const u of urls) expect(isNietFlexwerkPad(padVan(u)), u).toBe(false);
    // de flexwerk-kern blijft
    expect(urls.some((u) => padVan(u) === "/")).toBe(true);
    expect(urls.some((u) => padVan(u) === "/klussen")).toBe(true);
    expect(urls.some((u) => padVan(u) === "/uitzendbureau")).toBe(true);
  });
});
