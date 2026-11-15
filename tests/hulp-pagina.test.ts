import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { nl as woordenNl } from "@/lib/i18n/dictionaries";
import { en as woordenEn } from "@/lib/i18n/dictionary-en";

// De twee hulpcentra op een eigen pagina (15 nov 2026): /dashboard/hulp voor werkers (vijf talen), /werkgever/hulp voor bedrijven (nl en en), met een vaste
// plek: Account → Hulpcentrum voor de werker, Hulpcentrum in het menu voor het bedrijf, en een regel bovenaan het vraagteken in de kopbalk.

const bron = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");

describe("de hulppagina's", () => {
  it("bestaan, elk met de eigen versie van de teksten", () => {
    expect(existsSync(path.join(process.cwd(), "app/dashboard/hulp/page.tsx"))).toBe(true);
    expect(existsSync(path.join(process.cwd(), "app/werkgever/hulp/page.tsx"))).toBe(true);
    expect(bron("app/dashboard/hulp/page.tsx")).toMatch(/hulpTeksten\(await getLocale\(\)\)/);
    expect(bron("app/dashboard/hulp/page.tsx")).toContain('soort="werker"');
    expect(bron("app/werkgever/hulp/page.tsx")).toMatch(/hulpTekstenWerkgever\(await getLocale\(\)\)/);
    expect(bron("app/werkgever/hulp/page.tsx")).toContain('soort="bedrijf"');
    // de werker-versie haalt nooit de teksten voor bedrijven binnen, en andersom
    expect(bron("app/dashboard/hulp/page.tsx")).not.toContain("werkgever-teksten");
    expect(bron("app/werkgever/hulp/page.tsx")).not.toMatch(/lib\/hulp\/teksten"/);
  });

  it("het bedrijf heeft Hulpcentrum in het menu, in beide talen van de werkgeversapp", () => {
    expect(woordenNl.nav.hulp).toBe("Hulpcentrum");
    expect(woordenEn.nav.hulp).toBe("Help centre");
    expect(bron("app/werkgever/layout.tsx")).toMatch(/hulp: \{ href: "\/werkgever\/hulp", label: t\.nav\.hulp/);
  });

  it("de werker vindt het hulpcentrum onder Account, in de eigen taal", () => {
    const a = bron("app/dashboard/account/page.tsx");
    expect(a).toContain('href: "/dashboard/hulp"');
    expect(a).toMatch(/label: hulpTeksten\(locale\)\.titel/);
  });

  it("het vraagteken verwijst naar de eigen pagina van de versie", () => {
    const c = bron("components/app/HulpCentrum.tsx");
    expect(c).toMatch(/soort === "bedrijf" \? "\/werkgever\/hulp" : "\/dashboard\/hulp"/);
  });

  it("de pagina is een clientcomponent die alleen typen uit de teksten haalt, en kiest de chat per versie", () => {
    const k = bron("components/app/HulpPaginaInhoud.tsx");
    expect(k.startsWith('"use client"')).toBe(true);
    expect(k).not.toMatch(/import\s+(?!type\b)[^;]*from ["']@\/lib\/hulp\/(teksten|werkgever-teksten)["']/);
    expect(k).toMatch(/soort === "bedrijf" \? SUPPORT_CHAT_WERKGEVER : SUPPORT_CHAT/);
    // toegankelijk: het zoekveld heeft een label, foutmeldingen een rol
    expect(k).toMatch(/<label htmlFor=\{zoekId\}/);
    expect(k).toContain('role="alert"');
  });
});
