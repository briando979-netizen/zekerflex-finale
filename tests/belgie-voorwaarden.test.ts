import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { APP_PAGES } from "@/lib/dev/app-pages.generated";
import { isPublicApiRoute } from "@/lib/auth/public-routes";
import { nl } from "@/lib/i18n/dictionaries";
import { en } from "@/lib/i18n/dictionary-en";

// De bemiddelingsvoorwaarden voor België (app/(marketing)/belgie/voorwaarden, spec-belgie.md hoofdstuk 3): een openbare pagina
// met de rechten en plichten, gelinkt vanaf de Belgische checklist en de pagina Locaties van het bedrijf.

const ROOT = process.cwd();
const lees = (f: string) => readFileSync(path.join(ROOT, f), "utf8").split("\r\n").join("\n");
const PAGINA = "app/(marketing)/belgie/voorwaarden/page.tsx";

describe("/belgie/voorwaarden", () => {
  const bron = lees(PAGINA);

  it("is een openbare pagina: canonical, in de sitemap en de rondgang, niet achter een login, ook in de app", () => {
    expect(bron).toContain('canonical("/belgie/voorwaarden"');
    expect(lees("app/sitemap.ts")).toContain('entry("/belgie/voorwaarden"');
    expect(APP_PAGES.some((p) => p.route === "/belgie/voorwaarden" && p.area === "Marketing")).toBe(true);
    // een pagina, geen API-route: middleware houdt alleen /api/* en de app-omgevingen dicht
    expect(isPublicApiRoute("/belgie/voorwaarden")).toBe(false);
    const mw = lees("middleware.ts");
    const lijst = mw.slice(mw.indexOf("const APP_ALLOWED = ["), mw.indexOf("];", mw.indexOf("const APP_ALLOWED = [")));
    expect(lijst).toContain('"/belgie/voorwaarden"');
    // en de pagina exporteert alleen wat Next toestaat (AGENTS.md, 20 nov)
    expect([...bron.matchAll(/^export (?:const|function|async function|default function) (\w+)/gm)].map((m) => m[1])).toEqual(["metadata", "BelgieVoorwaardenPage"]);
  });

  it("zegt de vier dingen uit de specificatie: werkers betalen nooit, het bedrijf kiest, bericht over de keuze, kopie van het dossier", () => {
    expect(bron).toContain("Werkers betalen ZekerFlex nooit iets");
    expect(bron).toContain("Het bedrijf kiest zelf wie er werkt");
    expect(bron).toContain("krijgt bericht over de keuze");
    expect(bron).toContain("een kopie van krijgen");
    expect(bron).toContain("Download mijn gegevens");
    expect(bron).toContain("rijksregisternummer");
    // de platformkosten uit de ene bron (lib/pricing/tiers.ts), niet als los getal
    expect(bron).toContain("BASE_FEE_PER_HOUR_CENTS");
  });

  it("wordt gelinkt vanaf de checklist, het klusformulier en Locaties, in het Nederlands en het Engels", () => {
    expect(lees("components/werkgever/BelgieKlusPaneel.tsx")).toContain('href="/belgie/voorwaarden"');
    expect(lees("components/werkgever/BelgieKlusKeuze.tsx")).toContain('href="/belgie/voorwaarden"');
    expect(lees("app/werkgever/locaties/page.tsx")).toContain('href="/belgie/voorwaarden"');
    for (const d of [nl, en]) {
      expect(d.belgie.voorwaardenLink.length).toBeGreaterThan(10);
      expect(d.belgie.locatiesLink.length).toBeGreaterThan(10);
    }
  });
});

describe("de werkgeverskant in twee talen", () => {
  it("elke tekst van het Belgische paneel staat in het Nederlands en het Engels, met dezelfde plaatshouders", () => {
    const plaats = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
    const vlak = (o: Record<string, unknown>, voor = ""): [string, string][] =>
      Object.entries(o).flatMap(([k, v]) => (typeof v === "string" ? [[voor + k, v] as [string, string]] : vlak(v as Record<string, unknown>, `${voor}${k}.`)));
    const nlT = new Map(vlak(nl.belgie));
    const enT = new Map(vlak(en.belgie));
    expect([...enT.keys()].sort()).toEqual([...nlT.keys()].sort());
    for (const [k, v] of nlT) {
      expect(plaats(enT.get(k) ?? ""), k).toBe(plaats(v));
      if (v.length > 20) expect(enT.get(k), k).not.toBe(v);
    }
  });
});
