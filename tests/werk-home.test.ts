import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { BEDRIJVEN_HOME, WERK_AANMELDEN, WERK_FAQ, WERK_GROEPEN, WERK_HERO, WERK_SLOT, WERK_STAPPEN, WERK_VOORDELEN, werkFaqJsonLd } from "@/lib/marketing/werk-home";
import { SEO_STANDAARD } from "@/lib/ontwerp/seo";
import { APP_PAGES } from "@/lib/dev/app-pages.generated";
import { openbareRoutes } from "@/lib/ops/rondgang";

// De homepagina voor werkzoekenden (11 nov 2026): zekerflex.com is voor de werker,
// de vorige homepagina staat ongewijzigd op /bedrijven.

const alleTekst = () =>
  JSON.stringify([WERK_HERO, WERK_GROEPEN, WERK_STAPPEN, WERK_VOORDELEN, WERK_FAQ, WERK_SLOT]);

describe("homepagina voor werkzoekenden", () => {
  it("praat alleen tegen de werker: geen bedrijfsprijs, abonnement of software", () => {
    const tekst = alleTekst();
    for (const woord of ["3,50", "abonnement", "webshop", "branchesoftware", "personeel inhuren"]) expect(tekst).not.toContain(woord);
    expect(WERK_AANMELDEN).toBe("/register?type=freelancer");
  });

  it("heeft een knop naar de homepagina voor bedrijven, en die pagina bestaat", () => {
    expect(BEDRIJVEN_HOME).toBe("/bedrijven");
    expect(WERK_HERO.wissel.knop).toBe("Ik zoek personeel");
    expect(existsSync(join(process.cwd(), "app", "(marketing)", "bedrijven", "page.tsx"))).toBe(true);
    expect(APP_PAGES.some((p) => p.route === "/bedrijven" && !p.dynamic)).toBe(true);
    // de nachtelijke rondgang controleert beide
    expect(openbareRoutes()).toEqual(expect.arrayContaining(["/", "/bedrijven"]));
  });

  it("heeft eigen titels voor Google, en elke foto bestaat met de herkomst erbij", () => {
    expect(SEO_STANDAARD["/"].omschrijving).not.toContain("3,50");
    expect(SEO_STANDAARD["/bedrijven"].omschrijving).toContain("€ 3,50");
    for (const g of WERK_GROEPEN) expect(existsSync(join(process.cwd(), "public", g.foto)), g.foto).toBe(true);
    expect(existsSync(join(process.cwd(), "public", "werk", "hero.jpg"))).toBe(true);
    expect(existsSync(join(process.cwd(), "public", "werk", "CREDITS.md"))).toBe(true);
  });

  it("geeft de vragen ook als FAQPage aan zoekmachines", () => {
    const ld = werkFaqJsonLd() as { "@type": string; mainEntity: { name: string }[] };
    expect(ld["@type"]).toBe("FAQPage");
    expect(ld.mainEntity.map((q) => q.name)).toEqual(WERK_FAQ.map((f) => f.q));
  });
});
