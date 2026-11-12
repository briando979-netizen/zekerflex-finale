import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// AGENTS.md: "Client-componenten importeren nooit iets dat prisma, kv, mail of zod meeneemt." Eén importeert het per ongeluk
// en de browser krijgt de server mee (of de build faalt op node:crypto). Deze bewaker volgt vanaf elk "use client"-bestand
// alle echte imports (geen `import type`) en meldt het pad naar een verboden module. Een puur hulpbestand afsplitsen
// (zoals lib/locatie/tabs.ts of lib/rijschool/whatsapp.ts) is de oplossing; een bewuste uitzondering komt in UITZONDERING, met reden.
// Een server-actie ("use server") houdt de keten: de browser krijgt alleen een verwijzing, geen code.

const ROOT = process.cwd();
const lees = (f: string) => readFileSync(path.join(ROOT, f), "utf8").split("\r\n").join("\n");

function bestanden(dir: string, uit: string[] = []): string[] {
  for (const e of readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) bestanden(rel, uit);
    else if (/\.tsx?$/.test(e.name)) uit.push(rel);
  }
  return uit;
}

/** Bewuste uitzonderingen: "client-bestand -> verboden module", met reden. */
const UITZONDERING: Record<string, string> = {};

/** Bestanden in lib/mail die puur zijn (alleen gegevens en hulpjes): de browser mag ze laden. Ze mogen zelf niets verbodens importeren; dat volgt de scan. */
const PUUR_MAIL = new Set(["lib/mail/presets.ts", "lib/mail/zf-address.ts"]);
const VERBODEN_PAD = /^lib\/(prisma|redis|env)\.tsx?$|^lib\/storage\/kv\.tsx?$|^lib\/mail\//;
const NODE_INGEBOUWD = new Set([
  "fs", "path", "crypto", "child_process", "net", "os", "http", "https", "http2", "stream", "zlib", "dns", "tls", "worker_threads", "buffer", "util", "events", "url", "readline", "vm",
]);

function verbodenPakket(spec: string): boolean {
  return (
    spec === "zod" ||
    spec.startsWith("zod/") ||
    spec === "@prisma/client" ||
    spec.startsWith("@prisma/client/") ||
    spec.startsWith("node:") ||
    NODE_INGEBOUWD.has(spec)
  );
}
const verbodenPad = (rel: string) => VERBODEN_PAD.test(rel) && !PUUR_MAIL.has(rel);

const zonderCommentaar = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");

/** De echte imports van een bestand: `import type`, `export type` en `import { type A }` tellen niet (die verdwijnen bij het bouwen). */
export function echteImports(src: string): string[] {
  const c = zonderCommentaar(src);
  const uit: string[] = [];
  for (const m of c.matchAll(/\b(?:import|export)\s+(type\s+)?([^;'"]*?)\s*from\s*["']([^"']+)["']/g)) {
    if (m[1]) continue;
    const lijst = (m[2] ?? "").trim();
    if (/^\{[^}]*\}$/.test(lijst)) {
      const namen = lijst.replace(/[{}]/g, "").split(",").map((x) => x.trim()).filter(Boolean);
      if (namen.length > 0 && namen.every((x) => /^type\s/.test(x))) continue;
    }
    uit.push(m[3]!);
  }
  for (const m of c.matchAll(/(?:^|[^\w.])import\s*["']([^"']+)["']/gm)) uit.push(m[1]!);
  for (const m of c.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) uit.push(m[1]!);
  return uit;
}

const heeftRichtlijn = (src: string, naam: string) =>
  new RegExp(`^\\s*(?:(?:\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/)\\s*)*["']${naam}["']`).test(src);

function vindLekken(): { client: number; lekken: string[] } {
  const alle = ["app", "components", "lib"].flatMap((d) => bestanden(d));
  const bestaat = new Set(alle);
  const kinderen = new Map<string, string[]>();
  const client: string[] = [];
  const server = new Set<string>();
  for (const f of alle) {
    const src = lees(f);
    if (heeftRichtlijn(src, "use client")) client.push(f);
    if (heeftRichtlijn(src, "use server")) server.add(f);
    kinderen.set(f, echteImports(src));
  }
  const los = (van: string, spec: string): string | null => {
    let basis: string;
    if (spec.startsWith("@/")) basis = spec.slice(2);
    else if (spec.startsWith(".")) basis = path.posix.normalize(path.posix.join(path.posix.dirname(van), spec));
    else return null;
    for (const ext of ["", ".tsx", ".ts", "/index.tsx", "/index.ts"]) if (bestaat.has(basis + ext)) return basis + ext;
    return null;
  };
  const lekken = new Map<string, string>();
  for (const start of client) {
    const vorige = new Map<string, string | null>([[start, null]]);
    const rij = [start];
    const keten = (f: string): string[] => {
      const u: string[] = [];
      for (let k: string | null | undefined = f; k; k = vorige.get(k)) u.unshift(k);
      return u;
    };
    while (rij.length) {
      const f = rij.shift()!;
      for (const spec of kinderen.get(f) ?? []) {
        if (verbodenPakket(spec)) {
          const sleutel = `${f} -> ${spec}`;
          if (!lekken.has(sleutel)) lekken.set(sleutel, `${keten(f).join(" -> ")} -> ${spec}`);
          continue;
        }
        const r = los(f, spec);
        if (!r || vorige.has(r)) continue;
        vorige.set(r, f);
        if (server.has(r)) continue;
        if (verbodenPad(r)) {
          const sleutel = `${f} -> ${r}`;
          if (!lekken.has(sleutel)) lekken.set(sleutel, `${keten(f).join(" -> ")} -> ${r}`);
          continue;
        }
        rij.push(r);
      }
    }
  }
  return {
    client: client.length,
    lekken: [...lekken].filter(([sleutel]) => !Object.hasOwn(UITZONDERING, sleutel)).map(([, pad]) => pad),
  };
}

describe("client-componenten laden geen server mee", () => {
  const { client, lekken } = vindLekken();

  it("de scan vindt de client-bestanden", () => {
    expect(client).toBeGreaterThan(300);
  });

  it("geen client-bestand bereikt prisma, kv, redis, env, mail, zod of een node-module", () => {
    expect(lekken, "splits een puur hulpbestand af (zoals lib/locatie/tabs.ts) en importeer dat in het client-bestand").toEqual([]);
  });

  it("elke uitzondering heeft een reden", () => {
    for (const [k, reden] of Object.entries(UITZONDERING)) expect(reden.length, k).toBeGreaterThan(10);
  });

  it("herkent echte imports en laat type-imports met rust", () => {
    expect(echteImports('import { z } from "zod";')).toEqual(["zod"]);
    expect(echteImports('import type { A } from "@/lib/prisma";')).toEqual([]);
    expect(echteImports('import { type A, type B } from "@/lib/prisma";')).toEqual([]);
    expect(echteImports('import { type A, b } from "@/lib/prisma";')).toEqual(["@/lib/prisma"]);
    expect(echteImports('export { x } from "./y";')).toEqual(["./y"]);
    expect(echteImports('const m = await import("@/lib/redis");')).toEqual(["@/lib/redis"]);
    expect(echteImports('// import { z } from "zod";\nimport a from "./a";')).toEqual(["./a"]);
    expect(echteImports('import "./side-effect";')).toEqual(["./side-effect"]);
  });
});
