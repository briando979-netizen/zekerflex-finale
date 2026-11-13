import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ontwerpenVoor } from "@/lib/sites/ontwerpen";

// /website-maken (13 nov): de openbare ingang voor een bedrijf dat zelf een website of webshop wil maken. Alles op de
// pagina moet bestaan: de ontwerpen, de prijs en de links. Geen verzonnen cijfers of beoordelingen.

const bron = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");
const pagina = bron("app/(marketing)/website-maken/page.tsx");
const galerij = bron("components/marketing/OntwerpGalerij.tsx");

describe("de pagina", () => {
  it("toont de echte ontwerpen voor website en webshop, en een storing in de galerij breekt de pagina niet", () => {
    expect(pagina).toContain('galerijVoor("website").catch(() => [])');
    expect(pagina).toContain('galerijVoor("webshop").catch(() => [])');
    expect(ontwerpenVoor("website").length).toBeGreaterThan(5);
    expect(ontwerpenVoor("webshop").length).toBeGreaterThan(4);
  });

  it("elke kaartfoto bestaat", () => {
    for (const o of [...ontwerpenVoor("website"), ...ontwerpenVoor("webshop")]) {
      const foto = o.foto.split("?")[0] ?? "";
      if (foto.startsWith("/voorbeeldsites/foto/")) continue; // een route, geen bestand
      expect(existsSync(path.join(process.cwd(), "public", foto)), `${o.id}: ${o.foto}`).toBe(true);
    }
  });

  it("de prijs komt uit de abonnementen zelf en er staat eerlijk bij wanneer je betaalt", () => {
    expect(pagina).toContain("const vanaf = euro(WEBSITE_PLANS.basis.priceCentsPerMonth);");
    expect(pagina).toContain("`Bouwen en bekijken is gratis. Je betaalt pas als je hem online zet, vanaf ${vanaf} per maand.`");
    // geen los bedrag in de tekst
    expect(pagina).not.toMatch(/€\s?\d/);
  });

  it("staat betalen dicht of is het niet gemeten, dan geen prijs en geen belofte dat je nu online kunt", () => {
    // dezelfde stand als de Webshop-console; alleen een gemeten 'open' telt, een storing telt als dicht
    expect(pagina).toContain("const kanOnline = (await accountStand().catch(() => null))?.betalen === true;");
    expect(pagina).toContain('"Bouwen en bekijken is gratis. Online zetten kan binnenkort."');
    expect(pagina).toContain("const stappen = [...STAPPEN, kanOnline ? STAP_ONLINE : STAP_BINNENKORT];");
    // elke plek waar de prijs staat hangt aan die stand
    const metPrijs = pagina.split("\n").filter((r) => r.includes("{vanaf}"));
    expect(metPrijs.length).toBeGreaterThan(0);
    for (const r of metPrijs) expect(r.includes("kanOnline ?") || pagina.slice(pagina.indexOf("{kanOnline ? (\n            <p"), pagina.indexOf(") : (\n            <p")).includes(r), r).toBe(true);
    // de beschrijving voor zoekmachines belooft het ook niet
    expect(pagina.slice(pagina.indexOf("description:"), pagina.indexOf("...canonical"))).not.toContain("online zet");
    // alleen lezen
    expect(pagina).not.toMatch(/kvSet|\.(create|update|delete)\(/);
  });

  it("geen verzonnen aantallen, sterren of klanten", () => {
    expect(pagina).not.toMatch(/\d[\d.]*\+? (klanten|bedrijven|websites|gebruikers)/i);
    expect(pagina).not.toMatch(/sterren|beoordeling|review/i);
  });

  it("de links gaan naar pagina's die bestaan, en de structuurgegevens gaan via ldJson", () => {
    expect(pagina).toContain('const BEGIN = "/register?type=bedrijf";');
    for (const p of ["app/(marketing)/voorbeeldsites/page.tsx", "app/(marketing)/abonnementen/page.tsx"]) expect(existsSync(path.join(process.cwd(), p)), p).toBe(true);
    expect(existsSync(path.join(process.cwd(), "app/register/page.tsx")) || existsSync(path.join(process.cwd(), "app/(auth)/register/page.tsx"))).toBe(true);
    expect(pagina).toContain("ldJson(breadcrumbJsonLd(");
    expect(pagina).not.toContain("JSON.stringify");
  });

  it("staat in de sitemap en is te vinden vanaf de voorbeeldsites", () => {
    expect(bron("app/sitemap.ts")).toContain('entry("/website-maken", 0.8, "monthly"),');
    expect(bron("app/(marketing)/voorbeeldsites/page.tsx")).toContain('<Link href="/website-maken"');
  });
});

describe("de galerij", () => {
  it("filtert alleen; het voorbeeld staat er alleen als het bestaat", () => {
    expect(galerij).toContain("{k.voorbeeld ? (");
    expect(galerij).toContain('aria-pressed={filter === f}');
    expect(galerij).not.toContain("fetch(");
    // een clientbestand: geen opslag of database
    expect(galerij).not.toMatch(/from "@\/lib\/(prisma|storage|sites\/ontwerpen-server)/);
  });
});
