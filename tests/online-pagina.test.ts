import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AANBOD, aanbodHref } from "@/lib/marketing/aanbod";
import { MERKEN, merkVan } from "@/lib/marketing/online-merken";
import { ALLE_ONLINE_TOOLS, ONLINE_FAQ, ONLINE_GROEPEN, VERGELIJK, WAAROM_HIER } from "@/lib/marketing/online-tools";

// /online (19 nov 2026, eigenaar): alle losse online tools op één pagina, met een eigen logo per tool. Elke knop moet
// naar iets echts wijzen, elk beeld moet bestaan, de tekst belooft niets wat er niet is, en de pagina staat in menu,
// sitemap en de rondgang-lijst.

const bron = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");
const paginaBestaat = (href: string) => {
  const pad = href.replace(/[#?].*$/, "");
  if (pad.startsWith("/werkgever/") || pad.startsWith("/aanbod/")) return true; // eigen werkruimte (achter login) en de aanbodpagina's per slug
  const map = path.join(process.cwd(), "app", "(marketing)", ...pad.split("/").filter(Boolean));
  return existsSync(path.join(map, "page.tsx")) || existsSync(path.join(process.cwd(), "app", ...pad.split("/").filter(Boolean), "page.tsx"));
};

describe("alles voor je bedrijf online (/online)", () => {
  it("heeft de gevraagde tools: website, webshop, logo, domein registreren/verhuizen/beheren, en meer", () => {
    const sleutels = ALLE_ONLINE_TOOLS.map((t) => t.sleutel);
    for (const s of ["website", "webshop", "logo-maker", "advertentie-op-maat", "domeinnaam", "domein-verhuizen", "domein-beheren", "zakelijke-mail", "website-check", "review-check", "rekentools", "apps", "apps-en-spelletjes"]) {
      expect(sleutels, s).toContain(s);
    }
    expect(ALLE_ONLINE_TOOLS.length).toBeGreaterThanOrEqual(13);
    expect(new Set(sleutels).size).toBe(sleutels.length);
  });

  it("elke tool heeft een eigen logo (merkteken) met eigen kleuren en vorm, geen emoji", () => {
    const kleuren = new Set<string>();
    for (const t of ALLE_ONLINE_TOOLS) {
      expect(Object.hasOwn(MERKEN, t.sleutel), `merk voor ${t.sleutel}`).toBe(true);
      const m = merkVan(t.sleutel);
      expect(m.paden.length, t.sleutel).toBeGreaterThan(0);
      for (const d of m.paden) expect(d, `${t.sleutel}: ${d}`).toMatch(/^M[\d. ,-]/);
      expect(m.van).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(m.naar).toMatch(/^#[0-9A-Fa-f]{6}$/);
      kleuren.add(`${m.van}${m.naar}`);
      // geen emoji in naam of tekst (de eigenaar: echte eigen logo's)
      expect(`${t.naam}${t.kort}${t.knop}`).not.toMatch(/\p{Extended_Pictographic}/u);
    }
    // elk merk zijn eigen kleurverloop
    expect(kleuren.size).toBe(ALLE_ONLINE_TOOLS.length);
  });

  it("elke knop wijst naar een bestaande pagina, elk beeld bestaat, en elke tool uit het aanbod is beschikbaar", () => {
    for (const t of ALLE_ONLINE_TOOLS) {
      expect(t.knop.length, t.sleutel).toBeGreaterThan(2);
      if (t.extern) expect(t.href).toMatch(/^https:\/\/[a-z]+\.zekerflex\.com/);
      else expect(paginaBestaat(t.href), `${t.sleutel} → ${t.href}`).toBe(true);
      if (t.beeld) expect(existsSync(path.join(process.cwd(), "public", t.beeld.src)), `${t.sleutel}: ${t.beeld.src}`).toBe(true);
      const a = AANBOD.find((x) => x.slug === t.sleutel);
      if (a) {
        expect(a.status).toBe("beschikbaar");
        if (!["website", "webshop", "domeinnaam"].includes(t.sleutel)) expect(t.href).toBe(aanbodHref(a));
      }
    }
    for (const g of ONLINE_GROEPEN) expect(g.tools.length, g.sleutel).toBeGreaterThan(0);
  });

  it("belooft niets wat er niet is: geen 'binnenkort', geen verzonnen cijfers of sterren", () => {
    const tekst = JSON.stringify({ ALLE_ONLINE_TOOLS, WAAROM_HIER, ONLINE_FAQ, VERGELIJK }) + bron("app/(marketing)/online/page.tsx");
    expect(tekst).not.toMatch(/binnenkort/i);
    expect(tekst).not.toMatch(/\d[\d.]*\+? (klanten|bedrijven|websites|gebruikers)/i);
    // geen eigen "4,8 sterren" of "★★★★★" (over reviews van anderen praten mag: de review-check en Google-reviews)
    expect(tekst).not.toMatch(/\d[,.]\d ?(sterren|★)|★{2,}|\d+\+? ?(reviews|beoordelingen)\b/i);
  });

  it("de pagina gebruikt de lijst, de merken en ldJson, en staat in sitemap, menu en rondgang-lijst", () => {
    const pagina = bron("app/(marketing)/online/page.tsx");
    expect(pagina).toContain("ALLE_ONLINE_TOOLS.map(");
    expect(pagina).toContain("<ToolMerk ");
    expect(pagina).toContain("ldJson(breadcrumbJsonLd(");
    expect(pagina).not.toContain("JSON.stringify");
    expect(pagina).toContain('canonical("/online")');
    expect(bron("app/sitemap.ts")).toContain('entry("/online"');
    expect(bron("lib/marketing/site-nav.ts")).toContain('href: "/online"');
    // de brede Aanbod-uitklap tekent AANBOD_KOLOMMEN, niet de menu-items: de link moet dus echt in de kolom staan (desktop én mobiel)
    expect(bron("components/marketing/SiteHeader.tsx")).toContain("ALLES_ONLINE.href");
    expect(bron("components/marketing/MobileMenu.tsx")).toContain("ALLES_ONLINE.href");
    expect(bron("lib/dev/app-pages.generated.ts")).toContain('"route":"/online"');
  });
});
