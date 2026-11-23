import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { nl } from "@/lib/i18n/dictionaries";
import { en } from "@/lib/i18n/dictionary-en";

// De gedeelde kop van de onderpagina's van Instellingen (eigenaar, 23 nov 2026: zoals bij YoungOnes): titel, "Terug naar instellingen"
// en rechts een optionele actieknop. De pagina's houden hun adres en inhoud; alleen de kop is overal gelijk.

const lees = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");

/** De bestaande onderpagina's die bij Instellingen horen, met hun adres (dat niet mag veranderen). */
const ONDERPAGINAS: Record<string, string> = {
  "/werkgever/bedrijf": "app/werkgever/bedrijf/page.tsx",
  "/werkgever/locaties": "app/werkgever/locaties/page.tsx",
  "/werkgever/team": "app/werkgever/team/page.tsx",
  "/werkgever/templates": "app/werkgever/templates/page.tsx",
  "/werkgever/favorieten/pools": "app/werkgever/favorieten/pools/page.tsx",
  "/werkgever/integraties": "app/werkgever/integraties/page.tsx",
  "/werkgever/reviews": "app/werkgever/reviews/page.tsx",
  "/werkgever/account": "app/werkgever/account/page.tsx",
  "/werkgever/introduceren": "app/werkgever/introduceren/page.tsx",
};

describe("InstellingenKop", () => {
  const kop = lees("components/werkgever/InstellingenKop.tsx");

  it("heeft een titel (h1, hoofdletters), een link terug naar het overzicht en een plek voor de actieknop", () => {
    expect(kop.startsWith('"use client";')).toBe(true);
    expect(kop).toContain("<h1");
    expect(kop).toContain("uppercase");
    expect(kop).toContain('backHref = "/werkgever/instellingen"');
    expect(kop).toContain("{s.back}");
    expect(kop).toContain("{action ? <div");
    // props heten zoals bij PageHeader, zodat een pagina alleen de kop wisselt
    expect(kop).toMatch(/title: string;/);
    expect(kop).toMatch(/subtitle\?: string \| undefined;/);
  });

  it("de link is minstens 44 px hoog en breekt een lange titel af in plaats van de pagina te verbreden", () => {
    expect(kop).toContain("min-h-11");
    expect(kop).toContain("break-words");
    expect(kop).toContain("flex-wrap");
  });

  it("de tekst komt uit het woordenboek, in het Nederlands en Engels, zonder servercode in de browser", () => {
    expect(nl.settings.back).toBe("Terug naar instellingen");
    expect(en.settings.back).toBe("Back to settings");
    expect(kop).toContain("useT().settings");
    expect(kop).not.toMatch(/from "@\/lib\/(prisma|storage|mail|i18n\/server)|from "zod"|dictionary-en/);
  });

  it("gebruikt alleen kleuren met een donkere regel of een eigen merkkleur (geen standaardkleur van Tailwind)", () => {
    expect(kop).not.toMatch(/(?:bg|text)-(?:red|orange|amber|yellow|green|emerald|sky|blue|violet|purple|pink|rose|slate|gray|zinc)-\d{2,3}/);
  });
});

describe("de onderpagina's van Instellingen", () => {
  it.each(Object.entries(ONDERPAGINAS))("%s houdt zijn adres en heeft de gedeelde kop", (adres, bestand) => {
    expect(existsSync(path.join(process.cwd(), bestand)), adres).toBe(true);
    const bron = lees(bestand);
    expect(bron, adres).toContain("<InstellingenKop");
    expect(bron, adres).toContain('from "@/components/werkgever/InstellingenKop"');
    // geen eigen terug-link meer naar Instellingen in de pagina zelf
    expect(bron, adres).not.toContain("← {d.shell.settings}");
  });

  it("de pagina's met een eigen titel in het woordenboek geven die door als title", () => {
    expect(lees("app/werkgever/favorieten/pools/page.tsx")).toContain("title={t.pools.title}");
    expect(lees("app/werkgever/locaties/page.tsx")).toContain("<InstellingenKop title={l.title} subtitle={l.subtitle} />");
    expect(lees("app/werkgever/account/page.tsx")).toContain("<InstellingenKop title={t.titel} subtitle={t.sub} />");
  });

  it("Bedrijfsprofiel heeft zijn eigen knop Instellingen niet meer nodig: de kop heeft de link terug", () => {
    const bron = lees("app/werkgever/bedrijf/page.tsx");
    expect(bron).not.toContain("btn-ghost");
    expect(bron).not.toContain("{dict.settings.title}");
  });
});
