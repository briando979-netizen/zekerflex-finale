import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Een cache onder een cron moet korter zijn dan de afstand tussen twee runs (14 nov 2026). De careers-crawl bewaarde zijn
// uitslag 24 uur en de sales-motor draait elke 24 uur (08:00): of de dagelijkse run echt crawlde of de uitslag van gisteren
// kreeg, hing van seconden af. Op 14 nov kwam zo een uitslag van vóór de careers-sprong terug, en de sprong draaide nooit.
// Deze test leest de cronregel en de grenzen uit de code, zodat een langere cache of een zeldzamere cron hem laat falen.

const lees = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");

/** "60 * 60 * 20" of "6 * 60 * 60 * 1000" → getal; alleen getallen en keer. */
function reken(expr: string): number {
  const delen = expr.split("*").map((d) => Number(d.trim().replace(/_/g, "")));
  if (delen.some((d) => !Number.isFinite(d))) throw new Error(`geen som: ${expr}`);
  return delen.reduce((a, b) => a * b, 1);
}
function constante(bestand: string, naam: string): number {
  const m = lees(bestand).match(new RegExp(`const ${naam}\\s*=\\s*([\\d_\\s*]+);`));
  if (!m?.[1]) throw new Error(`${naam} niet gevonden in ${bestand}`);
  return reken(m[1]);
}

/** De kortste afstand (in seconden) tussen twee runs van een cronregel met vaste minuut en een uurveld. */
function kortsteAfstand(minuut: string, uur: string): number {
  if (!/^\d+$/.test(minuut)) throw new Error(`minuutveld ${minuut} wordt hier niet ondersteund`);
  if (uur === "*") return 3600;
  const stap = uur.match(/^\*\/(\d+)$/);
  if (stap?.[1]) return Number(stap[1]) * 3600;
  const uren = uur.split(",").map(Number).sort((a, b) => a - b);
  if (uren.some((u) => !Number.isInteger(u) || u < 0 || u > 23)) throw new Error(`uurveld ${uur}`);
  if (uren.length === 1) return 24 * 3600;
  const afstanden = uren.map((u, i) => ((uren[(i + 1) % uren.length] ?? u) - u + 24) % 24 || 24);
  return Math.min(...afstanden) * 3600;
}

/** De velden van de cronregel die dit adres aanroept. */
function cronVelden(adres: string): string[] {
  const regel = lees("deploy/cron/entrypoint.sh")
    .split("\n")
    .find((r) => r.includes(adres) && !r.trim().startsWith("#"));
  if (!regel) throw new Error(`geen cronregel voor ${adres}`);
  return regel.trim().split(/\s+/).slice(0, 5);
}

describe("caches onder de sales-motor zijn korter dan de afstand tussen twee runs", () => {
  const [minuut = "", uur = "", ...rest] = cronVelden("/api/internal/sales/tick");
  const afstand = kortsteAfstand(minuut, uur);

  it("de cronregel van de sales-motor wordt gevonden (nu elke dag om 08:00)", () => {
    // elke dag van de maand en van de week; anders klopt de afstand hieronder niet
    expect(rest).toEqual(["*", "*", "*"]);
    expect(afstand).toBe(24 * 3600);
  });

  it("de uitslag van een careers-crawl: korter, met ruimte (minstens een uur)", () => {
    const ttl = constante("lib/sales/discovery/careers.ts", "RESULT_TTL_S");
    expect(ttl).toBeLessThanOrEqual(afstand - 3600);
  });

  it("de grens waarop een ontdekkingsbron weer aan de beurt is: ook korter", () => {
    const interval = constante("lib/sales/engine.ts", "DISCOVERY_INTERVAL_MS") / 1000;
    expect(interval).toBeLessThanOrEqual(afstand - 3600);
  });

  it("de afstand uit een cronregel", () => {
    expect(kortsteAfstand("0", "8")).toBe(24 * 3600);
    expect(kortsteAfstand("0", "8,12,16")).toBe(4 * 3600);
    expect(kortsteAfstand("0", "22,2")).toBe(4 * 3600);
    expect(kortsteAfstand("15", "*")).toBe(3600);
    expect(kortsteAfstand("0", "*/6")).toBe(6 * 3600);
  });
});
