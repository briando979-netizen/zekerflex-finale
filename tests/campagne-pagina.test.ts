import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CAMPAGNE_DOELEN, campagneDoel, campagneFotoKeuzes, campagneFouten, campagneSlug } from "@/lib/campagne/pagina";
import { WERK_STROOK } from "@/lib/marketing/werk-home";
import { SECTORS } from "@/lib/seo-sectors";
import { ADMIN_HUBS } from "@/lib/admin/nav";

// Campagnepagina's en de nieuwe voorpagina (17 nov 2026, eigenaar: "doe dit maar dan"): per advertentie een eigen pagina op
// /c/<adres>, gemaakt in Beheer; op de voorpagina een schuivende strook met de soorten werk.

const lees = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

const goed = {
  slug: "zomer-horeca",
  doelgroep: "werker" as const,
  kop: "Werken in",
  kopAccent: "de horeca?",
  tekst: "Kies zelf je diensten bij jou in de buurt.",
  punten: ["Gratis aanmelden", "Met of zonder KVK"],
  knopTekst: "Meld je gratis aan",
  knopDoel: "aanmelden",
  foto: "campagne-tap",
  aan: true,
};

describe("campagnepagina's", () => {
  it("het adres: kleine letters, cijfers en streepjes; bezette of te korte adressen niet", () => {
    expect(campagneSlug("Zomer Horeca 2027!")).toBe("zomer-horeca-2027");
    expect(campagneSlug("  Café  Crème ")).toBe("cafe-creme");
    expect(campagneSlug("ab")).toBeNull();
    expect(campagneSlug("admin")).toBeNull();
    expect(campagneSlug("constructor")).toBeNull();
    expect(campagneSlug("!!!")).toBeNull();
  });

  it("een goede pagina heeft geen fouten; elke regel geeft een eigen melding in gewoon Nederlands", () => {
    expect(campagneFouten(goed)).toEqual([]);
    expect(campagneFouten({ ...goed, slug: "Zomer Horeca" })[0]).toContain("adres");
    expect(campagneFouten({ ...goed, kop: "" })[0]).toContain("eerste regel");
    expect(campagneFouten({ ...goed, tekst: "kort" })[0]).toContain("tekst onder de kop");
    expect(campagneFouten({ ...goed, punten: ["a", "b", "c", "d"].map((x) => `punt ${x}`) })[0]).toContain("drie punten");
    expect(campagneFouten({ ...goed, foto: "bestaat-niet" })[0]).toContain("foto");
    expect(campagneFouten({ ...goed, knopDoel: "constructor" })[0]).toContain("knop");
  });

  it("de knop gaat alleen naar een eigen pagina, en past bij de doelgroep", () => {
    for (const [sleutel, d] of Object.entries(CAMPAGNE_DOELEN)) {
      expect(d.href.startsWith("/"), sleutel).toBe(true);
      expect(d.href.startsWith("//"), sleutel).toBe(false);
    }
    expect(campagneDoel("https://kwaad.example")).toBeNull();
    expect(campagneFouten({ ...goed, knopDoel: "klus-plaatsen" })[0]).toContain("voor bedrijven");
    expect(campagneFouten({ ...goed, doelgroep: "bedrijf", knopDoel: "klus-plaatsen" })).toEqual([]);
  });

  it("geen beloftes die ZekerFlex niet waarmaakt", () => {
    for (const zin of ["Je bent gratis verzekerd tijdens je klus.", "Gegarandeerd werk in jouw stad, elke week.", "Je wordt binnen 1 minuut betaald."]) {
      expect(campagneFouten({ ...goed, tekst: zin }).some((f) => f.includes("niet kan waarmaken")), zin).toBe(true);
    }
  });

  it("de eigen campagnebeelden staan bovenaan in de fotokeuze", () => {
    const keuzes = campagneFotoKeuzes();
    expect(keuzes[0]?.slug.startsWith("campagne-")).toBe(true);
    expect(keuzes.length).toBeGreaterThan(30);
  });

  it("de pagina is er voor de advertentie, niet voor Google; uit of onbekend geeft 404", () => {
    const pagina = lees("app/(marketing)/c/[slug]/page.tsx");
    expect(pagina).toContain("robots: { index: false, follow: false }");
    expect(pagina).toContain("if (!p || !p.aan) return null;");
    expect(pagina).toContain("if (!d) notFound();");
  });

  it("opslaan en weghalen mag alleen de platformbeheerder; de pagina staat in het beheermenu", () => {
    const route = lees("app/api/admin/campagnes/route.ts");
    expect(route.match(/withAdminAccess\(\["PLATFORM_ADMIN"\]/g)).toHaveLength(2);
    expect(route).toContain("campagneFouten(pagina)");
    expect(lees("app/admin/campagnes/page.tsx")).toContain('hasRole(principal, "PLATFORM_ADMIN")');
    expect(ADMIN_HUBS.find((h) => h.id === "groei")?.pages.some((p) => p.href === "/admin/campagnes")).toBe(true);
  });
});

describe("de schuivende strook op de flexwerk-pagina", () => {
  it("elke soort werk gaat naar een pagina die bestaat", () => {
    const werkerPaginas = new Set(SECTORS.map((s) => `/${s.workerSlug}`));
    for (const s of WERK_STROOK) {
      const ok = werkerPaginas.has(s.href) || existsSync(path.join(process.cwd(), "app", "(marketing)", s.href.slice(1), "page.tsx"));
      expect(ok, s.href).toBe(true);
    }
    expect(WERK_STROOK.length).toBeGreaterThanOrEqual(5);
  });

  it("beweegt met alleen CSS, staat stil bij 'minder beweging', en de herhaling is verborgen voor schermlezers en het toetsenbord", () => {
    // de strook verhuisde met de werkers-home mee van / naar /flexwerk (19 nov 2026)
    const flexwerk = lees("app/(marketing)/flexwerk/page.tsx");
    expect(flexwerk).toContain('className="marquee gap-3 pr-3"');
    expect(flexwerk).toContain("aria-hidden={ronde > 0 ? true : undefined}");
    expect(flexwerk).toContain("tabIndex={ronde > 0 ? -1 : undefined}");
    expect(lees("app/globals.css")).toContain("@media (prefers-reduced-motion: reduce) { .marquee { animation: none; } }");
  });
});
