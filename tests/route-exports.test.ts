import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Een route.ts mag alleen de HTTP-handlers en de Next-instellingen exporteren. Iets anders (een constante, een hulpje)
// laat `next build` falen met "… is not a valid Route export field", en dat ziet tsc/eslint/vitest niet: op 20 nov 2026
// mislukte daardoor een uitrol (app/api/werkgever/bereik/route.ts). Deze bewaker vangt het vóór de push.

const TOEGESTAAN = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "runtime", "dynamic", "revalidate", "maxDuration", "preferredRegion", "fetchCache", "dynamicParams", "generateStaticParams"]);
const ROOT = process.cwd();

function routes(dir: string, uit: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) routes(p, uit);
    else if (e.name === "route.ts" || e.name === "route.tsx") uit.push(p);
  }
  return uit;
}

describe("route-bestanden exporteren alleen handlers en Next-instellingen", () => {
  it("geen extra export in app/**/route.ts", () => {
    const fouten: string[] = [];
    for (const f of routes(path.join(ROOT, "app"))) {
      if (!statSync(f).isFile()) continue;
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/^export\s+(?:async\s+)?(?:const|let|var|function|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/gm)) {
        const naam = m[1]!;
        // types en interfaces bestaan niet tijdens het draaien: die mogen
        if (/^export\s+(type|interface)\s/.test(m[0])) continue;
        if (!TOEGESTAAN.has(naam)) fouten.push(`${path.relative(ROOT, f).split(path.sep).join("/")}: ${naam}`);
      }
      for (const m of src.matchAll(/^export\s*\{([^}]*)\}/gm)) {
        for (const deel of m[1]!.split(",")) {
          const naam = deel.trim().split(/\s+as\s+/).pop()?.trim();
          if (naam && !TOEGESTAAN.has(naam)) fouten.push(`${path.relative(ROOT, f).split(path.sep).join("/")}: ${naam}`);
        }
      }
    }
    expect(fouten, "zet dit in een los lib-bestand of haal het export-woord weg").toEqual([]);
  });
});
