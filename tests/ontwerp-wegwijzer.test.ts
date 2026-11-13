import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ONTWERPER_TABS, isOntwerperTab } from "@/lib/ontwerp/tabs";
import { WEGWIJZER, wegwijzerHref } from "@/lib/ontwerp/wegwijzer";

// "Zelf inrichten" in Beheer → Instellingen (13 nov): waar je wat aanpast, in gewone taal. Elke regel moet bij een bestaand
// tabblad van de Site-ontwerper of een bestaande beheerpagina uitkomen.

const ROOT = process.cwd();
const bron = (f: string) => readFileSync(path.join(ROOT, f), "utf8").split("\r\n").join("\n");

describe("de tabbladen van de ontwerper", () => {
  it("een geldig tabblad wordt herkend, al het andere niet", () => {
    for (const t of ONTWERPER_TABS) expect(isOntwerperTab(t.id)).toBe(true);
    for (const v of ["", "constructor", "toString", "Shop", undefined, null, 3, ["shop"]]) expect(isOntwerperTab(v)).toBe(false);
  });

  it("de ontwerper opent op het tabblad uit de link, en anders op Stijl", () => {
    expect(bron("components/admin/ontwerper/Ontwerper.tsx")).toContain('useState<Tab>(beginTab ?? "stijl")');
    expect(bron("app/admin/ontwerper/page.tsx")).toContain("beginTab={isOntwerperTab(tab) ? tab : undefined}");
  });
});

describe("de wegwijzer", () => {
  it("elke regel zegt wat je wilt doen en hoe het werkt, in gewone zinnen", () => {
    expect(WEGWIJZER.length).toBeGreaterThanOrEqual(10);
    expect(new Set(WEGWIJZER.map((r) => r.wat)).size).toBe(WEGWIJZER.length);
    for (const r of WEGWIJZER) {
      expect(r.wat.length, r.wat).toBeGreaterThan(10);
      expect(r.uitleg.length, r.wat).toBeGreaterThan(30);
      expect(r.uitleg.endsWith("."), r.wat).toBe(true);
    }
  });

  it("elke link komt uit bij een bestaand tabblad of een bestaande beheerpagina", () => {
    for (const r of WEGWIJZER) {
      const href = wegwijzerHref(r);
      if ("tab" in r.doel) {
        expect(isOntwerperTab(r.doel.tab), r.wat).toBe(true);
        expect(href).toBe(`/admin/ontwerper?tab=${r.doel.tab}`);
      } else {
        expect(href, r.wat).toMatch(/^\/admin\/[a-z-]+$/);
        expect(existsSync(path.join(ROOT, "app", href.slice(1), "page.tsx")), `${r.wat}: ${href}`).toBe(true);
      }
    }
  });

  it("de webshop en het verslepen staan erin", () => {
    const tabs = WEGWIJZER.flatMap((r) => ("tab" in r.doel ? [r.doel.tab] : []));
    expect(tabs).toContain("shop");
    expect(tabs).toContain("home");
    expect(WEGWIJZER.some((r) => "pagina" in r.doel && r.doel.pagina === "/admin/shop")).toBe(true);
  });

  it("Beheer → Instellingen toont de wegwijzer boven de andere kaarten", () => {
    const src = bron("app/admin/beheer/page.tsx");
    expect(src).toContain("Zelf inrichten: wat wil je aanpassen?");
    expect(src.indexOf("WEGWIJZER.map(")).toBeLessThan(src.indexOf("CARDS.map("));
    expect(src).toContain('hasRole(principal, "PLATFORM_ADMIN")');
  });
});
