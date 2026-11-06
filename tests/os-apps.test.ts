import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { OS_CATEGORIEEN, OS_ROLLEN, alleApps, appsVoor, perCategorie, zoekApps, STANDAARD_VASTGEZET, type OsRol } from "@/lib/os/apps";
import { MAX_VASTGEZET, normalizeInstellingen, standaardInstellingen } from "@/lib/os/instellingen";

const apps = alleApps();

/** /werkgever/uren → app/werkgever/uren/page.tsx (ook met route-groepen zoals app/(marketing)). */
function heeftPagina(href: string): boolean {
  const pad = href.split("?")[0]?.replace(/^\/|\/$/g, "") ?? "";
  const basis = join(process.cwd(), "app");
  for (const groep of ["", "(marketing)", "(app)"]) {
    const map = groep ? join(basis, groep, pad) : join(basis, pad);
    if (existsSync(join(map, "page.tsx")) || existsSync(join(map, "page.ts"))) return true;
  }
  return false;
}

describe("ZekerFlex OS — de appcatalogus", () => {
  it("elke app heeft een uniek id, een categorie die bestaat en minstens één rol", () => {
    const ids = apps.map((a) => a.id);
    expect(new Set(ids).size, "dubbele app-id's").toBe(ids.length);
    const categorieen = new Set(OS_CATEGORIEEN.map((c) => c.id));
    for (const a of apps) {
      expect(categorieen.has(a.categorie), `${a.id}: onbekende categorie ${a.categorie}`).toBe(true);
      expect(a.rollen.length, `${a.id}: zonder rol`).toBeGreaterThan(0);
      expect(a.naam.trim(), a.id).not.toBe("");
      expect(a.uitleg.trim(), `${a.id}: zonder uitleg`).not.toBe("");
      expect(a.href.startsWith("/"), `${a.id}: ${a.href}`).toBe(true);
    }
  });

  it("elke app wijst naar een pagina die echt bestaat", () => {
    const dood = apps.filter((a) => !heeftPagina(a.href)).map((a) => `${a.id} → ${a.href}`);
    expect(dood, "apps zonder pagina").toEqual([]);
  });

  it("elke rol heeft apps, en de werker ziet geen beheer- of werkgeverapps", () => {
    for (const rol of OS_ROLLEN) expect(appsVoor(rol).length, rol).toBeGreaterThan(5);
    const werker = appsVoor("werker");
    expect(werker.some((a) => a.href.startsWith("/admin"))).toBe(false);
    expect(werker.some((a) => a.href.startsWith("/werkgever"))).toBe(false);
    const werkgever = appsVoor("werkgever");
    expect(werkgever.some((a) => a.href.startsWith("/admin"))).toBe(false);
    expect(werkgever.some((a) => a.href.startsWith("/dashboard"))).toBe(false);
    // de beheerder heeft het hele beheermenu als apps
    expect(appsVoor("admin").filter((a) => a.href.startsWith("/admin")).length).toBeGreaterThan(40);
  });

  it("de buitendienst krijgt zijn eigen omgeving en niet die van een ander", () => {
    const verkoper = appsVoor("verkoper");
    expect(verkoper.some((a) => a.href === "/sales")).toBe(true);
    for (const pad of ["/admin", "/werkgever", "/dashboard"]) {
      expect(verkoper.some((a) => a.href.startsWith(pad)), pad).toBe(false);
    }
    // en andersom: /sales hoort niet bij de werker of de werkgever
    for (const rol of ["werker", "werkgever"] as const) {
      expect(appsVoor(rol).some((a) => a.href.startsWith("/sales")), rol).toBe(false);
    }
  });

  it("wat standaard op het bureaublad staat, bestaat ook en mag bij die rol", () => {
    for (const rol of OS_ROLLEN) {
      const mag = new Set(appsVoor(rol).map((a) => a.id));
      for (const id of STANDAARD_VASTGEZET[rol]) expect(mag.has(id), `${rol}: ${id}`).toBe(true);
    }
  });

  it("zoeken vindt op naam, zoekwoord en uitleg; de beste treffer eerst", () => {
    const werker = appsVoor("werker");
    expect(zoekApps(werker, "uren")[0]?.id).toBe("w-uren");
    expect(zoekApps(werker, "loonstrook").map((a) => a.id)).toContain("w-verloning");
    expect(zoekApps(werker, "")).toEqual([]);
    expect(zoekApps(werker, "qqqzzz")).toEqual([]);
  });

  it("per categorie geeft alleen gevulde groepen, in vaste volgorde", () => {
    const groepen = perCategorie(appsVoor("werkgever"));
    expect(groepen.length).toBeGreaterThan(3);
    for (const g of groepen) expect(g.apps.length).toBeGreaterThan(0);
    const volgorde = groepen.map((g) => g.categorie.id);
    expect([...volgorde].sort((a, b) => OS_CATEGORIEEN.findIndex((c) => c.id === a) - OS_CATEGORIEEN.findIndex((c) => c.id === b))).toEqual(volgorde);
  });
});

describe("ZekerFlex OS — de voorkeuren", () => {
  it("een app van een andere rol kan niet op je bureaublad komen", () => {
    const i = normalizeInstellingen({ vastgezet: ["a-gebruikers", "w-uren", "w-uren", "bestaat-niet"] }, "werker");
    expect(i.vastgezet).toEqual(["w-uren"]);
    expect(normalizeInstellingen({ vastgezet: ["a-gebruikers"] }, "admin").vastgezet).toEqual(["a-gebruikers"]);
  });

  it("leeg of kapot geeft de standaard, nooit een leeg bureaublad", () => {
    for (const rol of OS_ROLLEN as readonly OsRol[]) {
      expect(normalizeInstellingen(null, rol)).toEqual(standaardInstellingen(rol));
      expect(normalizeInstellingen({ vastgezet: [] }, rol).vastgezet).toEqual(standaardInstellingen(rol).vastgezet);
      expect(normalizeInstellingen("onzin", rol).achtergrond).toBe("nacht");
    }
  });

  it("hooguit 24 apps op het bureaublad, en een onbekende achtergrond valt terug", () => {
    const veel = appsVoor("admin").map((a) => a.id);
    expect(veel.length).toBeGreaterThan(MAX_VASTGEZET);
    expect(normalizeInstellingen({ vastgezet: veel, achtergrond: "regenboog" }, "admin").vastgezet.length).toBe(MAX_VASTGEZET);
    expect(normalizeInstellingen({ achtergrond: "licht" }, "admin").achtergrond).toBe("licht");
    expect(normalizeInstellingen({ herstelVensters: false }, "admin").herstelVensters).toBe(false);
  });
});
