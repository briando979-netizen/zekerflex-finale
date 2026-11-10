import { describe, expect, it } from "vitest";
import { GERESERVEERDE_SLUGS, MAX_PAGINAS, beginPaginaId, bouwerUrl, isGereserveerdeSlug, isPaginaBouwer, nieuweSlug, paginaBouwerHref } from "@/lib/sites/paginabouwer";
import { siteSaveSchema } from "@/lib/sites/schema";
import { safeHref } from "@/lib/sites/render";
import { webshopPages, webshopTemplate } from "@/lib/sites/webshop-templates";
import { THEME_PRESETS, type Company, type Theme } from "@/lib/sites/types";

// De paginabouwer werkt op de website én op de webshop (elk een eigen site): de API-adressen dragen
// `?soort=`, een nieuwe pagina krijgt nooit een adres van de winkel (/winkel, /p/…, /bestellen, …),
// en de studio weet waar de bouwer staat.

const bedrijf: Company = { naam: "Bakkerij De Vries", kvk: "12345678", straat: "Dorpsstraat 1", postcode: "1234 AB", plaats: "Utrecht", telefoon: "030 1234567", email: "info@bakkerij.test" };
const theme: Theme = { kleur: THEME_PRESETS[0]?.kleur ?? "#0f3d2e", accent: THEME_PRESETS[0]?.accent ?? "#f59e0b", lettertype: "modern", hoeken: "rond" };

let teller = 0;
const id = () => `b${(teller++).toString(36).padStart(8, "0")}`;
const winkelPaginas = () => webshopPages(webshopTemplate("algemeen"), bedrijf, id);

describe("gereserveerde adressen", () => {
  it("houdt de routes van de winkel vrij", () => {
    for (const slug of ["winkel", "p", "bestellen", "besteld", "mand", "reserveren", "gereserveerd", "privacy", "bedankt", "media", "assets", "wat-kan-deze-site"]) {
      expect(isGereserveerdeSlug(slug), slug).toBe(true);
    }
    expect(isGereserveerdeSlug("voorwaarden")).toBe(false);
    expect(isGereserveerdeSlug("verzenden-en-retourneren")).toBe(false);
  });

  it("de server weigert elk gereserveerd adres als pagina", () => {
    const pages = winkelPaginas();
    expect(siteSaveSchema.safeParse({ theme, bedrijf, pages }).success).toBe(true);
    for (const slug of GERESERVEERDE_SLUGS) {
      const metFout = pages.map((p) => (p.slug === "over-ons" ? { ...p, slug } : p));
      expect(siteSaveSchema.safeParse({ theme, bedrijf, pages: metFout }).success, slug).toBe(false);
    }
  });

  it("de server staat hooguit MAX_PAGINAS pagina's toe", () => {
    const pages = winkelPaginas();
    const extra = (n: number) => Array.from({ length: n }, (_, i) => ({ ...pages[1]!, id: `px${i}`, slug: `extra-${i}` }));
    expect(siteSaveSchema.safeParse({ theme, bedrijf, pages: [...pages, ...extra(MAX_PAGINAS - pages.length)] }).success).toBe(true);
    expect(siteSaveSchema.safeParse({ theme, bedrijf, pages: [...pages, ...extra(MAX_PAGINAS - pages.length + 1)] }).success).toBe(false);
  });
});

describe("nieuweSlug", () => {
  it("maakt het adres uit de titel", () => {
    expect(nieuweSlug("Over ons", [""])).toBe("over-ons");
    expect(nieuweSlug("Retour & ruilen", [""])).toBe("retour-en-ruilen");
    expect(nieuweSlug("!!!", [""])).toBe("pagina");
  });

  it("geeft een pagina nooit het adres van de winkel of de homepagina", () => {
    for (const titel of ["Winkel", "Bestellen", "Besteld", "Mand", "P", "Reserveren", "Home"]) {
      const slug = nieuweSlug(titel, [""]);
      expect(isGereserveerdeSlug(slug), titel).toBe(false);
      expect(slug).not.toBe("home");
    }
    expect(nieuweSlug("Winkel", [""])).toBe("winkel-info");
    // "home" in een knop of het menu is de homepagina, dus een pagina met dat adres zou niemand vinden
    expect(safeHref("home", "/site/x/", [{ slug: "" }, { slug: "home" }])).toBe("/site/x");
  });

  it("telt door bij een adres dat al bestaat", () => {
    expect(nieuweSlug("Contact", ["", "contact"])).toBe("contact-2");
    expect(nieuweSlug("Contact", ["", "contact", "contact-2"])).toBe("contact-3");
    expect(nieuweSlug("Winkel", ["", "winkel-info"])).toBe("winkel-info-2");
  });

  it("blijft binnen de 40 tekens die de server toestaat, ook met een nummer erachter", () => {
    const titel = "Alles over onze duurzame verpakkingen nu";
    const eerste = nieuweSlug(titel, [""]);
    const tweede = nieuweSlug(titel, ["", eerste]);
    expect(eerste.length).toBeLessThanOrEqual(40);
    expect(tweede.length).toBeLessThanOrEqual(40);
    expect(tweede).not.toBe(eerste);
    expect(tweede).toMatch(/^[a-z0-9-]{1,40}$/);
    expect(tweede.endsWith("-2")).toBe(true);
  });
});

describe("bouwerUrl", () => {
  it("geeft de webshop ?soort=webshop mee, ook onder /publish en /media", () => {
    expect(bouwerUrl("/api/werkgever/sites", "", "webshop")).toBe("/api/werkgever/sites?soort=webshop");
    expect(bouwerUrl("/api/werkgever/sites", "/publish", "webshop")).toBe("/api/werkgever/sites/publish?soort=webshop");
    expect(bouwerUrl("/api/werkgever/sites", "/media", "webshop")).toBe("/api/werkgever/sites/media?soort=webshop");
    expect(bouwerUrl("/api/werkgever/sites", "/stats", "webshop", "dagen=30")).toBe("/api/werkgever/sites/stats?soort=webshop&dagen=30");
  });

  it("laat zonder soort het adres zoals het was (oude bouwer, websitevoorstel)", () => {
    expect(bouwerUrl("/api/werkgever/sites")).toBe("/api/werkgever/sites");
    expect(bouwerUrl("/api/admin/websitevoorstellen/abc/site", "/publish")).toBe("/api/admin/websitevoorstellen/abc/site/publish");
    expect(bouwerUrl("/api/werkgever/sites", "/stats", null, "dagen=7")).toBe("/api/werkgever/sites/stats?dagen=7");
    expect(bouwerUrl("/api/werkgever/sites", "", "website")).toBe("/api/werkgever/sites?soort=website");
  });
});

describe("de bouwer in de studio", () => {
  it("staat voor de webshop onder Pagina's, met een pagina om mee te beginnen", () => {
    expect(paginaBouwerHref("webshop")).toBe("/studio/webshop/paginas");
    expect(paginaBouwerHref("website")).toBe("/studio/website/bouwer");
    expect(paginaBouwerHref("webshop", "voorwaarden")).toBe("/studio/webshop/paginas?pagina=voorwaarden");
    expect(paginaBouwerHref("webshop", "")).toBe("/studio/webshop/paginas?pagina=home");
  });

  it("herkent de bouwer (volle breedte, eigen knop Publiceren), niet de andere onderdelen", () => {
    expect(isPaginaBouwer("/studio/webshop/paginas")).toBe(true);
    expect(isPaginaBouwer("/studio/website/bouwer")).toBe(true);
    expect(isPaginaBouwer("/studio/webshop/producten")).toBe(false);
    expect(isPaginaBouwer("/studio/webshop/paginas-oud")).toBe(false);
    expect(isPaginaBouwer("/studio/webshop")).toBe(false);
  });

  it("opent de gevraagde pagina, de homepagina bij 'home', en niets bij een onbekend adres", () => {
    const pages = winkelPaginas();
    const voorwaarden = pages.find((p) => p.slug === "voorwaarden");
    const home = pages.find((p) => p.slug === "");
    expect(beginPaginaId(pages, "voorwaarden")).toBe(voorwaarden?.id);
    expect(beginPaginaId(pages, "home")).toBe(home?.id);
    expect(beginPaginaId(pages, "bestaat-niet")).toBeNull();
    expect(beginPaginaId(pages, undefined)).toBeNull();
  });
});
