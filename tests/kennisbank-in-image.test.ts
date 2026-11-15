import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// De handleidingen (docs/kennisbank) worden bij "Vullen" gelezen uit process.cwd()/docs/kennisbank in de draaiende app (lib/kennisbank/outline.ts).
// Tot 15 nov 2026 sloot .dockerignore de hele map docs uit en kopieerde het Dockerfile hem nergens naartoe: de map was in de app leeg en
// Outline kreeg nooit een handleiding. Deze test houdt dat dicht.

const bron = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");

describe("de handleidingen komen in de draaiende app", () => {
  it(".dockerignore laat docs/kennisbank door, de rest van docs niet", () => {
    const regels = bron(".dockerignore").split("\n").map((r) => r.trim());
    expect(regels).toContain("docs/*");
    expect(regels).toContain("!docs/kennisbank");
    expect(regels.indexOf("!docs/kennisbank")).toBeGreaterThan(regels.indexOf("docs/*"));
    expect(regels).not.toContain("docs");
  });

  it("het Dockerfile kopieert de map naar het uiteindelijke image", () => {
    const d = bron("Dockerfile");
    expect(d).toMatch(/COPY --from=build [^\n]*\/app\/docs\/kennisbank \.\/docs\/kennisbank/);
    // in de laatste fase (runner), niet alleen in de bouwfase
    expect(d.indexOf("./docs/kennisbank")).toBeGreaterThan(d.indexOf("AS runner"));
  });

  it("de map heeft verzamelingen met handleidingen (voor werkers, bedrijven en intern)", () => {
    const mappen = readdirSync(path.join(process.cwd(), "docs", "kennisbank"), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
    expect(mappen.length).toBeGreaterThanOrEqual(3);
    for (const m of mappen) {
      const md = readdirSync(path.join(process.cwd(), "docs", "kennisbank", m)).filter((f) => f.endsWith(".md"));
      expect(md.includes("_verzameling.md"), m).toBe(true);
      expect(md.length, m).toBeGreaterThanOrEqual(2);
    }
  });
});
