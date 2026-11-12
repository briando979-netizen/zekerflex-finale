import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Bewaker (13 nov, contrastmeting werker-app): een licht vlak van de eigen kleuren met een dekking (bg-brand-50/40,
// bg-paper-soft/95, bg-white/55, …) bleef in het donker een licht of middengrijs vlak, met lichte tekst erop (2:1;
// o.a. het ondertekenblok van de uitzendovereenkomst). tests/donker-dekking.test.ts kijkt alleen naar de standaardkleuren
// van Tailwind zonder dekking; deze test vult dat aan. Elke zo'n variant in de werker- en werkgeversapp heeft een regel
// `.app-scope[data-theme="dark"] .<klasse>` in app/globals.css.

const ROOT = process.cwd();
const DIRS = ["app/dashboard", "app/werkgever", "components/app", "components/werkgever", "components/chat"];
const KLASSE = /(?<![\w:-])(bg-(?:white|paper|paper-soft|brand-50|brand-100|(?:money|plan|trust|ok|warn|crit)-soft)\/\d{1,3})(?![\w-])/g;

/** Bewust zonder donkere regel: wit glas op een donkere kop of foto, in beide thema's hetzelfde. */
const GLAS: Record<string, string> = {
  "bg-white/10": "glas op de donkere kop (eerste indruk, wie ben jij, gesprek)",
  "bg-white/20": "glas op de donkere kop van de startwizard",
  "bg-white/25": "glas op de donkere kop (eerste indruk, wie ben jij)",
  "bg-white/30": "glas over de camera van de ID-scan",
};

function bestanden(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((naam) => {
    const p = path.join(dir, naam);
    if (statSync(p).isDirectory()) return bestanden(p);
    return /\.tsx?$/.test(naam) ? [p] : [];
  });
}

describe("lichte vlakken met een dekking hebben een donkere regel", () => {
  it("elke variant in de app heeft een regel in globals.css (of staat bewust als glas op de lijst)", () => {
    const css = readFileSync(path.join(ROOT, "app/globals.css"), "utf8");
    const klassen = new Set<string>();
    for (const f of DIRS.flatMap((d) => bestanden(path.join(ROOT, d)))) for (const m of readFileSync(f, "utf8").matchAll(KLASSE)) klassen.add(m[1] ?? "");
    const zonder = [...klassen].filter((k) => k && !Object.hasOwn(GLAS, k) && !css.includes(`[data-theme="dark"] .${k.replace("/", "\\/")}`)).sort();
    expect(zonder).toEqual([]);
  });
});
