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

  // 21 nov 2026 (eigenaar: "haal al die extra dingen weg"): het beheer gaat alleen nog over het flexwerk-platform.
  // Zeven zichtbare onderdelen in vaste volgorde; alles buiten flexwerk staat in één dichtgeklapt onderdeel onderaan.
  it("zeven flexwerk-onderdelen in vaste volgorde, met één verborgen onderdeel onderaan", () => {
    expect(ADMIN_HUBS.map((hub) => hub.id)).toEqual(["overzicht", "mensen", "klussen", "geld", "communicatie", "ai", "systeem", "overig"]);
    expect(ADMIN_HUBS.filter((hub) => hub.verborgen).map((hub) => hub.id)).toEqual(["overig"]);
    expect(ADMIN_HUBS.at(-1)?.verborgen).toBe(true);
  });

  it("de zichtbare onderdelen blijven rustig: nooit meer dan twaalf pagina's per onderdeel", () => {
    for (const hub of ADMIN_HUBS.filter((h) => !h.verborgen)) expect(hub.pages.length, hub.id).toBeLessThanOrEqual(12);
  });

  it("telefonie, bank en AI-proeven staan niet in een zichtbaar onderdeel", () => {
    const zichtbaar = new Set(ADMIN_HUBS.filter((h) => !h.verborgen).flatMap((h) => h.pages.map((p) => p.href)));
    for (const href of ["/admin/telefonie", "/admin/bank", "/admin/ai-trader", "/admin/sim", "/admin/kantoor"]) {
      expect(zichtbaar.has(href), href).toBe(false);
    }
    // 22 nov 2026 (fase C): de beheerpagina's van webshop, websites, scans, advertenties, hardware, installaties, branches,
    // horeca-betalingen en Talkaro zijn weg, ook uit het verborgen onderdeel
    const overal = new Set(ADMIN_HUBS.flatMap((h) => h.pages.map((p) => p.href)));
    for (const href of ["/admin/webshop", "/admin/shop", "/admin/shop-ai", "/admin/verkoop-via-ai", "/admin/website-beheer", "/admin/websitevoorstellen", "/admin/scans", "/admin/advertentie-op-maat", "/admin/talkaro", "/admin/hardware", "/admin/installaties", "/admin/branches", "/admin/horeca-betalingen"]) {
      expect(overal.has(href), href).toBe(false);
    }
    // wat wél bij flexwerk hoort, staat zichtbaar: ook de Site-ontwerper en de huisstijl van de eigen site
    for (const href of ["/admin/gebruikers", "/admin/bedrijven", "/admin/onboarding", "/admin/vooruitblik", "/admin/disputes", "/admin/facturen", "/admin/berichten", "/admin/zekerflex-ai", "/admin/gratis", "/admin/systeem", "/admin/te-doen", "/admin/ontwerper", "/admin/huisstijl"]) {
      expect(zichtbaar.has(href), href).toBe(true);
    }
  });
});
