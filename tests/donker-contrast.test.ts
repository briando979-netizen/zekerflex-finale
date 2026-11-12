import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Donkere modus van de werker- en werkgeversapp (.app-scope[data-theme="dark"] in app/globals.css): de tint van gedempte tekst
// (--app-fg-faint, de kleur van .text-neutralx-400 en placeholders) haalde 3,96:1 op de kaartkleur, onder de 4,5:1 (WCAG AA)
// voor kleine tekst. Deze test rekent het contrast zelf uit, uit het CSS-bestand, en bewaakt dat licht en de beheeromgeving
// niet zijn aangeraakt.

const css = readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8").split("\r\n").join("\n");

const lum = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a: string, b: string): number => {
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

/** De tokens van het donkere blok `.app-scope[data-theme="dark"] { … }`. */
function donkerBlok(): Record<string, string> {
  const start = css.indexOf('.app-scope[data-theme="dark"] {');
  expect(start).toBeGreaterThan(-1);
  const blok = css.slice(start, css.indexOf("}", start));
  const uit: Record<string, string> = {};
  for (const m of blok.matchAll(/(--app-[a-z-]+):\s*(#[0-9A-Fa-f]{6})\s*;/g)) uit[m[1]!] = m[2]!;
  return uit;
}

describe("contrast in de donkere modus van de app", () => {
  const t = donkerBlok();

  it("de rekenmachine klopt: zwart op wit is 21:1, gelijk aan gelijk is 1:1", () => {
    expect(contrast("#000000", "#FFFFFF")).toBeCloseTo(21, 1);
    expect(contrast("#8A93A0", "#8A93A0")).toBeCloseTo(1, 5);
  });

  it("--app-fg-faint haalt minstens 4,5:1 op de kaart, de achtergrond én de hoverkleur", () => {
    const faint = t["--app-fg-faint"]!;
    expect(faint).toBe("#8A93A0");
    for (const achter of ["--app-card", "--app-surface", "--app-edge"]) {
      expect(contrast(faint, t[achter]!), `faint op ${achter}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("de andere teksttinten (hoofd en gedempt) haalden het al en blijven erboven", () => {
    for (const tint of ["--app-fg", "--app-fg-muted"]) {
      for (const achter of ["--app-card", "--app-surface", "--app-edge"]) {
        expect(contrast(t[tint]!, t[achter]!), `${tint} op ${achter}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("de gedempte tint blijft lichter dan de ondergrond maar donkerder dan de gewone gedempte tekst (de rangorde blijft)", () => {
    expect(lum(t["--app-fg-faint"]!)).toBeLessThan(lum(t["--app-fg-muted"]!));
    expect(lum(t["--app-fg-faint"]!)).toBeGreaterThan(lum(t["--app-card"]!));
  });
});

describe("alleen de werker- en werkgeversapp in donker is veranderd", () => {
  it("--app-fg-faint staat op precies één plek, in het donkere blok; het lichte thema kent hem niet", () => {
    expect(css.match(/--app-fg-faint:/g)?.length).toBe(1);
    const donker = css.indexOf('.app-scope[data-theme="dark"] {');
    expect(css.indexOf("--app-fg-faint:")).toBeGreaterThan(donker);
    expect(css.indexOf("--app-fg-faint:")).toBeLessThan(css.indexOf("}", donker));
  });

  it("de beheeromgeving heeft een eigen tint (--a-mute) en gebruikt deze variabele niet", () => {
    const beheer = css.slice(css.indexOf(".admin-scope[data-theme=\"dark\"] {"), css.indexOf(".admin-scope[data-theme=\"dark\"] {") + 1500);
    expect(beheer).not.toContain("--app-fg-faint");
  });

  it("de regels die de tint gebruiken zijn onveranderd (alleen binnen .app-scope[data-theme=\"dark\"])", () => {
    const gebruik = css.split("\n").filter((l) => l.includes("var(--app-fg-faint)"));
    expect(gebruik.length).toBe(2);
    for (const l of gebruik) expect(l).toContain('.app-scope[data-theme="dark"]');
  });
});
