import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Bewaker (12 nov 2026, AGENTS.md "Donkere modus"): de donkere modus van de werker- en werkgeversapp werkt alleen via
// regels `.app-scope[data-theme="dark"] .<klasse>` in app/globals.css; Tailwind `dark:` volgt het systeem, niet de
// themaknop. Een Tailwind-standaardkleur zonder zo'n regel blijft licht (een vlak) of donker (tekst) en wordt in het
// donker onleesbaar. Deze test zoekt in alle bestanden die /dashboard en /werkgever laden (ook de components die ze
// importeren) naar zulke klassen. Een nieuwe zonder donkere regel faalt; de basislijn hieronder is wat bewust zo blijft.

const ROOT = process.cwd();

/** Wat in het donker misgaat: een licht, dekkend vlak, of donkere tekst, in een standaardkleur van Tailwind. */
const STANDAARD = "red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone";
const RISICO = new RegExp(`^(?:[a-z-]+:)*(?:bg-(?:${STANDAARD})-(?:50|100|200)|text-(?:${STANDAARD})-(?:700|800|900|950))$`);
const KLASSE = /(?<![\w:/-])((?:[a-z-]+:)*(?:bg|text)-[a-z]+-\d{2,3})(?![\w/-])/g;

/** Klassen die bewust zonder donkere regel blijven (met reden). Leeg = alles gedekt. */
const BASISLIJN: Record<string, string> = {};

function bestanden(): string[] {
  const uit = new Set<string>();
  const rij: string[] = [];
  const loop = (dir: string) => {
    for (const naam of readdirSync(dir)) {
      const p = path.join(dir, naam);
      if (statSync(p).isDirectory()) loop(p);
      else if (/\.(tsx|ts)$/.test(naam)) rij.push(p);
    }
  };
  loop(path.join(ROOT, "app/dashboard"));
  loop(path.join(ROOT, "app/werkgever"));
  const importRx = /from\s+["']@\/(components\/[^"']+)["']|import\(\s*["']@\/(components\/[^"']+)["']/g;
  while (rij.length) {
    const f = rij.pop() as string;
    if (uit.has(f)) continue;
    uit.add(f);
    for (const m of readFileSync(f, "utf8").matchAll(importRx)) {
      const rel = m[1] ?? m[2] ?? "";
      for (const ext of [".tsx", ".ts", "/index.tsx", "/index.ts"]) {
        const p = path.join(ROOT, rel + ext);
        if (existsSync(p)) {
          if (!uit.has(p)) rij.push(p);
          break;
        }
      }
    }
  }
  return [...uit];
}

function gedekt(): Set<string> {
  const css = readFileSync(path.join(ROOT, "app/globals.css"), "utf8");
  const set = new Set<string>();
  for (const m of css.matchAll(/\.app-scope\[data-theme="dark"\]\s+\.((?:\\.|[\w-])+)/g)) set.add((m[1] ?? "").replace(/\\/g, ""));
  return set;
}

describe("donkere modus: elke risicokleur in de werker- en werkgeversapp heeft een donkere regel", () => {
  const regels = gedekt();
  const lijst = bestanden();

  it("leest genoeg bestanden (anders zoekt de bewaker op de verkeerde plek)", () => {
    expect(lijst.length).toBeGreaterThan(100);
    expect(regels.size).toBeGreaterThan(50);
  });

  it("geen nieuwe licht vlak of donkere tekst zonder regel in app/globals.css", () => {
    const zonder = new Map<string, Set<string>>();
    for (const f of lijst) {
      for (const m of readFileSync(f, "utf8").matchAll(KLASSE)) {
        const k = m[1] ?? "";
        if (!RISICO.test(k) || regels.has(k) || Object.hasOwn(BASISLIJN, k)) continue;
        const rel = path.relative(ROOT, f).replace(/\\/g, "/");
        zonder.set(k, (zonder.get(k) ?? new Set()).add(rel));
      }
    }
    const melding = [...zonder].map(([k, fs]) => `${k} (${[...fs].join(", ")})`);
    expect(melding, "voeg een regel .app-scope[data-theme=\"dark\"] .<klasse> toe in app/globals.css, met de lichte tint uit het donkere beheerthema").toEqual([]);
  });

  it("de regels houden de betekenis van de kleur (amber wacht, rood probleem, groen doen, violet verificatie, blauw gepland)", () => {
    const css = readFileSync(path.join(ROOT, "app/globals.css"), "utf8");
    expect(css).toMatch(/\.text-amber-900 \{ color: #fbbf24 !important; \}/);
    expect(css).toMatch(/\.bg-red-50 \{ background-color: rgba\(248, 113, 113, 0\.14\) !important; \}/);
    expect(css).toMatch(/\.text-violet-800 \{ color: #c4b0fb !important; \}/);
    expect(css).toMatch(/\.text-sky-800 \{ color: #93b4fb !important; \}/);
  });
});
