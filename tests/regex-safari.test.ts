import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Safari vóór 16.4 (en elke Safari op macOS Catalina, die nooit verder komt
// dan 15.6) kent geen lookbehind in een regex: `new RegExp` gooit dan
// "Invalid regular expression: invalid group specifier name" en de hele
// pagina valt om. Op 4 nov 2026 gebeurde dat 21 keer op productpagina's in
// de shop (lib/shop/product-specs.ts). Deze bewaker loopt vanuit elk
// "use client"-bestand de imports af en weigert lookbehind in alles wat de
// browser zo meekrijgt. Servercode mag het gewoon blijven gebruiken.

const ROOT = process.cwd();
const LOOKBEHIND = /\(\?<[=!]/;
const IMPORT = /(?:^|\n)\s*(?:import|export)\s+(?!type\b)[^;'"]*?from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(rel);
    return /\.tsx?$/.test(e.name) ? [rel] : [];
  });
}

function resolve(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? path.join(ROOT, spec.slice(2)) : spec.startsWith(".") ? path.resolve(path.dirname(path.join(ROOT, from)), spec) : null;
  if (!base) return null;
  for (const cand of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
    if (/\.tsx?$/.test(cand) && existsSync(cand)) return path.relative(ROOT, cand);
  }
  return null;
}

const cache = new Map<string, string>();
function read(rel: string): string {
  let s = cache.get(rel);
  if (s === undefined) {
    s = readFileSync(path.join(ROOT, rel), "utf8");
    cache.set(rel, s);
  }
  return s;
}

/** Alle bestanden die vanuit een client-component bereikbaar zijn, met het pad erheen. */
function clientReachable(): Map<string, string> {
  const start = [...sourceFiles("app"), ...sourceFiles("components")].filter((f) => /^\s*["']use client["']/.test(read(f)));
  const via = new Map<string, string>();
  const queue: string[] = [];
  for (const f of start) {
    via.set(f, f);
    queue.push(f);
  }
  while (queue.length) {
    const file = queue.shift() ?? "";
    for (const m of read(file).matchAll(IMPORT)) {
      const target = resolve(file, m[1] ?? m[2] ?? "");
      if (!target || via.has(target)) continue;
      via.set(target, file);
      queue.push(target);
    }
  }
  return via;
}

describe("regex in de browsercode", () => {
  it("geen lookbehind in code die een client-component meekrijgt", () => {
    const reachable = clientReachable();
    expect(reachable.size).toBeGreaterThan(100);
    const hits: string[] = [];
    for (const [file, from] of reachable) {
      const src = read(file);
      const m = LOOKBEHIND.exec(src);
      if (!m) continue;
      const line = src.slice(0, m.index).split("\n").length;
      hits.push(`${file.split(path.sep).join("/")}:${line} (via ${from.split(path.sep).join("/")})`);
    }
    expect(hits).toEqual([]);
  }, 60_000);
});
