import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";

// Scan op harde Nederlandse zinnen (3+ woorden met minstens twee Nederlandse functiewoorden) in de onderdelen die een deel van de app laadt:
// alles wat vanuit een beginmap bereikbaar is via imports in components/ of in die map. Gedeeld door de bewakers voor /werkgever
// (tests/werkgever-taal-bewaker.test.ts); de bewaker voor /dashboard heeft dezelfde regels (tests/werker-taal-bewaker.test.ts).

const lees = (f: string) => readFileSync(f, "utf8").split("\r\n").join("\n");

function bestanden(dir: string, uit: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) bestanden(p, uit);
    else if (/\.tsx?$/.test(e.name)) uit.push(p);
  }
  return uit;
}

const NL = /\b(je|jij|jouw|jou|het|een|niet|voor|naar|bij|van|met|deze|zijn|wordt|kun|kunt|geen|nog|ook|als|maar|dan|wat|hoe|om|aan|uit|zodat|worden|heb|hebt|hier|alle|tot|per|onze|ons|u|uw)\b/gi;
const ZIN = /["'`>]\s*([A-ZÀ-Ý][^"'`<>{}\n]{12,}|[a-zà-ý][^"'`<>{}\n]{18,})/g;
/** Onderdelen die de werkgeversapp niet toont of die zelf al een eigen vertaling dragen. */
const BUITEN = /^components\/(admin|marketing|i18n|auth)\//;

export function hardeZinnen(src: string): number {
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l) && !/^\s*import /.test(l))
    .join("\n")
    .replace(/className=("[^"]*"|\{`[^`]*`\})/g, "");
  let n = 0;
  for (const m of code.matchAll(ZIN)) {
    const z = m[1]!.trim();
    if (z.split(/\s+/).length < 3) continue;
    if ((z.match(NL) ?? []).length >= 2 && !/^(https?:|\/|[a-z-]+:)/.test(z) && !/^[a-z]+(\.[a-zA-Z]+)+/.test(z)) n += 1;
  }
  return n;
}

/** Per bereikt .tsx-bestand het aantal harde zinnen (alleen bestanden met minstens één). */
export function telVanaf(root: string, beginMap: string): Record<string, number> {
  const los = (van: string, spec: string): string | null => {
    let basis: string;
    if (spec.startsWith("@/")) basis = path.join(root, spec.slice(2));
    else if (spec.startsWith(".")) basis = path.resolve(path.dirname(van), spec);
    else return null;
    for (const ext of ["", ".tsx", ".ts", "/index.tsx", "/index.ts"]) {
      const p = basis + ext;
      if (existsSync(p) && statSync(p).isFile()) return p;
    }
    return null;
  };
  const begin = beginMap.split("/").join(path.sep);
  const bereikt = new Set<string>();
  const rij = bestanden(path.join(root, begin));
  const gedeeld = new RegExp(`/(components|${beginMap})/`);
  while (rij.length) {
    const f = rij.pop()!;
    if (bereikt.has(f)) continue;
    bereikt.add(f);
    for (const m of lees(f).matchAll(/from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g)) {
      const r = los(f, (m[1] ?? m[2])!);
      if (r && gedeeld.test(r.split(path.sep).join("/")) && !bereikt.has(r)) rij.push(r);
    }
  }
  const uit: Record<string, number> = {};
  for (const f of bereikt) {
    const rel = path.relative(root, f).split(path.sep).join("/");
    if (!f.endsWith(".tsx") || BUITEN.test(rel)) continue;
    const n = hardeZinnen(lees(f));
    if (n) uit[rel] = n;
  }
  return uit;
}
