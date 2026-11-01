import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { ADMIN_HUBS, visibleHubs } from "@/lib/admin/nav";

// Opdrachtgevers (HQ_ADMIN) mogen /admin in voor hun eigen disputen. Dat mag nooit betekenen dat
// ze ook platformdata kunnen zien, zoals sollicitaties, offertes of andermans klanten. Daarom
// controleert deze test de broncode van elke beheerroute en -pagina.

const ROOT = process.cwd();

function filesNamed(dir: string, name: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return filesNamed(full, name);
    return entry === name ? [full] : [];
  });
}

const rel = (file: string) => relative(ROOT, file).split(sep).join("/");

describe("wie bij de beheer-API mag", () => {
  const routes = filesNamed(join(ROOT, "app", "api", "admin"), "route.ts");

  it("elke route is strikt voor platformbeheerders", () => {
    const loose: string[] = [];
    for (const file of routes) {
      const src = readFileSync(file, "utf8");
      const methods = [...src.matchAll(/export (?:const|async function) (GET|POST|PUT|PATCH|DELETE)\b/g)];
      const roleLists = [...src.matchAll(/withAdminAccess(?:<[^(]*>)?\(\s*(\[[^\]]*\]|[A-Z_a-z]+)/g), ...src.matchAll(/(?:requireRole|hasRole)\(\s*\w+\s*,\s*([^)]*)\)/g)].map((m) => (m[1] ?? "").trim());
      const strict = roleLists.every((list) => /^\[?\s*"PLATFORM_ADMIN"\s*,?\s*\]?$/.test(list));
      if (methods.length > 0 && (roleLists.length === 0 || !strict)) loose.push(rel(file));
    }
    expect(loose).toEqual([]);
  });
});

describe("wie welke beheerpagina ziet", () => {
  // Deze pagina's tonen alleen gegevens van de ingelogde persoon zelf, of filteren op eigen bedrijf.
  const OWN_DATA = new Set([
    "app/admin/agenda/page.tsx",
    "app/admin/beveiliging/page.tsx",
    "app/admin/disputes/page.tsx",
    "app/admin/mijn-mail/page.tsx",
    "app/admin/whatsapp/page.tsx",
    "app/admin/jarvis/page.tsx",
  ]);

  it("elke andere pagina vraagt om een platformbeheerder", () => {
    const open: string[] = [];
    for (const file of filesNamed(join(ROOT, "app", "admin"), "page.tsx")) {
      if (OWN_DATA.has(rel(file))) continue;
      const src = readFileSync(file, "utf8");
      const guards = [...src.matchAll(/(?:requireRole|hasRole)\(\s*\w+\s*,\s*([^)]*)\)/g)].map((m) => (m[1] ?? "").trim());
      if (guards.length === 0 || !guards.every((g) => g === '"PLATFORM_ADMIN"')) open.push(rel(file));
    }
    expect(open).toEqual([]);
  });

  it("het menu voor opdrachtgevers toont alleen disputen", () => {
    const pages = visibleHubs(true).flatMap((hub) => hub.pages.map((page) => page.href));
    expect(pages).toEqual(["/admin/disputes"]);
  });

  it("platformbeheerders zien alles", () => {
    expect(visibleHubs(false)).toBe(ADMIN_HUBS);
  });
});
