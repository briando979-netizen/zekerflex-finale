import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BUDGET, FUNCTIES, KLEUREN, LOGO, VIDEO, VOORBEELDEN, aanvraagTekst } from "@/lib/website/aanvraag-opties";

// /website-maken (opnieuw ingericht op 19 nov 2026, eigenaar): een aanvraag met wensen in plaats van een galerij. Als
// voorbeeld staan er alleen de twee sites en de app (FlikFlak, deploy/flikflak) die we echt hebben gemaakt; de oude
// voorbeeldsites en webshopvoorbeelden niet meer.

const bron = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");
const pagina = bron("app/(marketing)/website-maken/page.tsx");
const formulier = bron("components/marketing/WebsiteAanvraagFormulier.tsx");
const route = bron("app/api/website-aanvraag/route.ts");

describe("de voorbeelden", () => {
  it("zijn alleen de twee sites en de app die we echt hebben gemaakt, met een foto die bestaat", () => {
    expect(VOORBEELDEN.map((v) => v.id)).toEqual(["smileyapp", "schwarzwald", "flikflak"]);
    for (const v of VOORBEELDEN) {
      expect(existsSync(path.join(process.cwd(), "public", v.foto)), v.foto).toBe(true);
      expect(v.href).toMatch(/^https:\/\/(smileyapp|schwarzwald|flikflak)\.zekerflex\.com$/);
    }
  });

  it("de pagina toont geen galerij met ontwerpen en geen oude voorbeeldsites meer", () => {
    expect(pagina).toContain("VOORBEELDEN.map(");
    expect(pagina).not.toMatch(/galerijVoor|OntwerpGalerij|\/voorbeeldsites/);
  });

  it("de oude voorbeeldsites sturen door en staan niet meer in het menu, het aanbod of de sitemap", () => {
    expect(bron("app/(marketing)/voorbeeldsites/page.tsx")).toContain('redirect("/website-maken#voorbeelden")');
    expect(bron("lib/marketing/site-nav.ts")).not.toContain('href: "/voorbeeldsites"');
    expect(bron("lib/marketing/aanbod.ts")).not.toContain('href: "/voorbeeldsites"');
    expect(bron("components/marketing/WebsiteCheck.tsx")).not.toContain('href="/voorbeeldsites"');
    expect(bron("app/sitemap.ts")).not.toContain('entry("/voorbeeldsites"');
    expect(bron("app/sitemap.ts")).toContain('entry("/website-maken", 0.8, "monthly"),');
  });
});

describe("het wensenformulier", () => {
  it("laat kleur, video, logo, budget, dashboard en inloggen kiezen", () => {
    expect(KLEUREN.length).toBeGreaterThan(6);
    expect(VIDEO).toContain("Nee, zonder video's");
    expect(LOGO).toContain("Ik heb een logo");
    expect(BUDGET.length).toBeGreaterThan(4);
    expect(FUNCTIES).toContain("Dashboard met inloggen (eigen beheer)");
    expect(FUNCTIES).toContain("Inloggen voor klanten");
    for (const naam of ["KLEUREN", "VIDEO", "LOGO", "BUDGET", "FUNCTIES", "PAGINAS", "STIJLEN", "WANNEER"]) expect(formulier, naam).toContain(naam);
  });

  it("is een clientbestand zonder opslag, database of zod, en meldt fouten toegankelijk", () => {
    expect(formulier.startsWith('"use client";')).toBe(true);
    expect(formulier).not.toMatch(/from "@\/lib\/(prisma|storage|mail)|from "zod"/);
    expect(formulier).toContain('role="alert"');
    expect(formulier).toContain('fetch("/api/website-aanvraag"');
  });

  it("de aanvraag wordt leesbare tekst met alles wat is gekozen, zonder lege regels", () => {
    const t = aanvraagTekst({ bedrijf: "Bakkerij Jansen", naam: "Jan", email: "jan@bakkerij.test", soort: "Website", kleuren: ["Groen", "Geel"], paginas: ["Home"], functies: ["Contactformulier"], budget: "Tot € 500", wensen: "  Graag met foto's  " });
    expect(t).toContain("Kleuren: Groen, Geel");
    expect(t).toContain("Budget: Tot € 500");
    expect(t).toContain("Eigen wensen: Graag met foto's");
    expect(t).not.toMatch(/Stijl|Video|Logo/);
    expect(t.split("\n").every((r) => r.trim().length > 0)).toBe(true);
  });
});

describe("de verwerking", () => {
  it("maakt een lead voor Beheer en mailt de eigenaar, maar niet bij een testadres", () => {
    expect(route).toContain('source: "website-aanvraag"');
    expect(route).toContain("if (!isReservedTestAddress(a.email))");
    expect(route).toContain("to: CONTACTS.sales");
    expect(route).toContain("enforceRateLimit(");
    expect(route).toContain("akkoord: z.literal(true)");
  });

  it("is een openbare route", () => {
    expect(bron("lib/auth/public-routes.ts")).toContain('"/api/website-aanvraag"');
  });
});

describe("de pagina", () => {
  it("belooft een voorbeeld in drie versies binnen een dag, zonder verzonnen cijfers, sterren of prijzen", () => {
    expect(pagina).toMatch(/Binnen een dag/);
    expect(pagina).toMatch(/drie versies/);
    expect(pagina).not.toMatch(/\d[\d.]*\+? (klanten|bedrijven|websites|gebruikers)/i);
    expect(pagina).not.toMatch(/sterren|beoordeling|review/i);
    expect(pagina).not.toMatch(/€\s?\d/);
    expect(pagina.split("\n").filter((r) => !/^\s*\/\//.test(r)).join("\n")).not.toMatch(/binnenkort/i);
  });

  it("de structuurgegevens gaan via ldJson en de link om zelf te bouwen bestaat", () => {
    expect(pagina).toContain("ldJson(breadcrumbJsonLd(");
    expect(pagina).not.toContain("JSON.stringify");
    expect(pagina).toContain('const ZELF = "/register?type=bedrijf";');
  });
});
