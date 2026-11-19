import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// De interne adressen (/api/internal/*, /api/metrics) horen van buiten niet te bestaan: de cron-container praat
// rechtstreeks met app:3000 en komt nooit door Caddy (deploy/caddy/Caddyfile, snippet interndicht, 19 nov 2026).
// Deze bewaker houdt dat zo: elk blok dat naar de app doorstuurt, importeert de snippet. Een nieuw subdomein
// zonder die regel zou de interne routes daar weer open zetten.

const caddy = readFileSync("deploy/caddy/Caddyfile", "utf8");
const zonderCommentaar = caddy
  .split("\n")
  .filter((regel) => !regel.trim().startsWith("#"))
  .join("\n");

/** De blokken op het hoogste niveau: een regel zonder inspringing die op "{" eindigt, tot de sluitende "}" in kolom 0. */
function blokken(tekst: string): { kop: string; inhoud: string }[] {
  const uit: { kop: string; inhoud: string }[] = [];
  const regels = tekst.split("\n");
  let kop: string | null = null;
  let inhoud: string[] = [];
  for (const regel of regels) {
    if (kop === null) {
      if (/^\S.*\{\s*$/.test(regel)) {
        kop = regel.replace(/\{\s*$/, "").trim();
        inhoud = [];
      }
      continue;
    }
    if (regel.startsWith("}")) {
      uit.push({ kop, inhoud: inhoud.join("\n") });
      kop = null;
      continue;
    }
    inhoud.push(regel);
  }
  return uit;
}

const alle = blokken(zonderCommentaar);
const snippet = alle.find((b) => b.kop === "(interndicht)");
const naarApp = alle.filter((b) => !b.kop.startsWith("(") && /reverse_proxy app:3000/.test(b.inhoud));

describe("Caddy: interne adressen zijn van buiten dicht", () => {
  it("de snippet sluit /api/internal en /api/metrics af met een 404, behalve de AI-node", () => {
    expect(snippet).toBeDefined();
    expect(snippet?.inhoud).toMatch(/path \/api\/internal\/\* \/api\/metrics/);
    expect(snippet?.inhoud).toMatch(/not path \/api\/internal\/ai-node\/\*/);
    // geen 403: een reeks 403's telt CrowdSec als inbraakpoging (AGENTS.md)
    expect(snippet?.inhoud).toMatch(/respond @intern 404/);
    expect(snippet?.inhoud).not.toMatch(/respond @intern 403/);
  });

  it("elk blok dat naar de app doorstuurt, importeert de snippet", () => {
    expect(naarApp.length).toBeGreaterThanOrEqual(4);
    const zonder = naarApp.filter((b) => !/import interndicht/.test(b.inhoud)).map((b) => b.kop);
    expect(zonder).toEqual([]);
  });
});
