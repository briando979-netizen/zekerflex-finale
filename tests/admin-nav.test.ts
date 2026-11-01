import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { ADMIN_HUBS, locateAdminPage } from "@/lib/admin/nav";

const ADMIN_DIR = join(process.cwd(), "app", "admin");

function pageRoutes(dir: string): string[] {
  const routes: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) routes.push(...pageRoutes(full));
    else if (name === "page.tsx") routes.push(`/admin/${relative(ADMIN_DIR, dir).split(sep).join("/")}`.replace(/\/$/, ""));
  }
  return routes;
}

/** Een pagina die alleen doorverwijst (geen eigen scherm) hoeft niet in het menu. */
const isRedirect = (route: string) => {
  const source = readFileSync(join(ADMIN_DIR, ...route.replace("/admin", "").split("/").filter(Boolean), "page.tsx"), "utf8");
  return /\bredirect\(/.test(source) && !/\/>|<\//.test(source);
};

describe("indeling van de beheeromgeving", () => {
  const inNav = new Set(ADMIN_HUBS.flatMap((hub) => hub.pages.map((page) => page.href)));

  it("elke beheerpagina is via het menu te bereiken", () => {
    const missing = pageRoutes(ADMIN_DIR).filter((route) => !route.includes("[") && !inNav.has(route) && !isRedirect(route));
    expect(missing).toEqual([]);
  });

  it("elk menu-item wijst naar een bestaande pagina", () => {
    const routes = new Set(pageRoutes(ADMIN_DIR));
    expect([...inNav].filter((href) => !routes.has(href))).toEqual([]);
  });

  it("geen pagina staat dubbel in het menu", () => {
    const all = ADMIN_HUBS.flatMap((hub) => hub.pages.map((page) => page.href));
    expect(all.length).toBe(new Set(all).size);
  });

  it("vindt het onderdeel bij een pagina en bij een detailpagina", () => {
    expect(locateAdminPage("/admin/facturen")?.hub.id).toBe("geld");
    expect(locateAdminPage("/admin")?.hub.id).toBe("overzicht");
    expect(locateAdminPage("/admin/gebruikers/abc123")?.page.href).toBe("/admin/gebruikers");
    expect(locateAdminPage("/admin/bestaat-niet")).toBeNull();
  });
});
