import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Bewaker (13 nov 2026, taak I van 86): een vaste openbare pagina met een canonical naar zichzelf hoort in de sitemap.
// Gemeten: /abonnementen, /nieuwsbrief, /rekentools/btw-nummer-check, /voorbeeldsites en /copyright hadden een eigen
// canonical en werden gelinkt, maar Google vond ze niet via sitemap.xml. Omgekeerd: geen vast pad in de sitemap dat
// noindex is of achter de disallow van robots.ts staat. Pagina's zonder eigen canonical (een formulier, een inlogscherm,
// /about met canonical naar /over-ons) vallen er vanzelf buiten.

const ROOT = process.cwd();
const lees = (f: string) => readFileSync(path.join(ROOT, f), "utf8").split("\r\n").join("\n");
const NOINDEX = /index:\s*false|noindex/;

const disallow = [...(lees("app/robots.ts").match(/const PRIVATE = \[([\s\S]*?)\];/)?.[1] ?? "").matchAll(/"(\/[^"]*)"/g)].map((m) => m[1]!);
const onder = (pad: string, lijst: string[]) =>
  lijst.some((p) => pad === p.replace(/\/$/, "") || pad.startsWith(p.endsWith("/") ? p : `${p}/`));
const inSitemap = new Set([...lees("app/sitemap.ts").matchAll(/entry\(\s*"(\/[^"]*)"/g)].map((m) => m[1]!));

/** Elke vaste pagina (geen [dynamisch] deel): route → bron van page.tsx. */
function paginas(dir = "app", uit = new Map<string, string>()): Map<string, string> {
  for (const e of readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (!e.isDirectory() || e.name.startsWith("_")) continue;
    const sub = `${dir}/${e.name}`;
    try {
      const src = lees(`${sub}/page.tsx`);
      const delen = sub.split("/").slice(1).filter((d) => !(d.startsWith("(") && d.endsWith(")")) && !d.startsWith("@"));
      if (!delen.some((d) => d.startsWith("["))) uit.set(`/${delen.join("/")}`, src);
    } catch {
      /* geen page.tsx in deze map */
    }
    paginas(sub, uit);
  }
  return uit;
}

/** Het pad uit canonical("/x") of canonical(PATH) met const PATH = "/x" in hetzelfde bestand. */
function canonicalPad(src: string): string | null {
  const m = src.match(/canonical\(\s*(?:"([^"]+)"|([A-Z_]\w*))/);
  if (!m) return null;
  if (m[1]) return m[1];
  return src.match(new RegExp(`const\\s+${m[2]}\\s*=\\s*"([^"]+)"`))?.[1] ?? null;
}

describe("sitemap.xml dekt de openbare pagina's", () => {
  const alle = paginas();

  it("de scan werkt (pagina's en sitemap gevonden)", () => {
    expect(alle.size).toBeGreaterThan(100);
    expect(inSitemap.has("/prijzen")).toBe(true);
    expect(disallow).toContain("/dashboard");
  });

  it("elke vaste openbare pagina met een canonical naar zichzelf staat in de sitemap", () => {
    const ontbreekt = [...alle]
      .filter(([route, src]) => canonicalPad(src) === route && !NOINDEX.test(src) && !onder(route, disallow))
      .map(([route]) => route)
      .filter((route) => !inSitemap.has(route));
    expect(ontbreekt, "zet ze in app/sitemap.ts (entry(pad, prioriteit, frequentie))").toEqual([]);
  });

  it("geen vast pad in de sitemap dat noindex is, achter de disallow staat of niet bestaat", () => {
    const fout = [...inSitemap].filter((p) => {
      const src = alle.get(p);
      return src === undefined || NOINDEX.test(src) || onder(p, disallow);
    });
    expect(fout).toEqual([]);
  });

  it("de sitemap wordt elke 10 minuten opnieuw gemaakt, niet één keer tijdens de build", () => {
    expect(lees("app/sitemap.ts")).toMatch(/export const revalidate = \d+;/);
  });
});
