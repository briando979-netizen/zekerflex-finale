import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { menuVoor, PERSONEEL_SLEUTELS, type MenuOpties, type MenuPlek, type MenuSleutel } from "@/lib/werkgever/werkruimte";
import { BEHEER_STANDAARD, HOOFD_STANDAARD, MENU_NAAM, isStandaardMenuVolgorde, normalizeMenuVolgorde, pasMenuVolgordeToe, standaardMenuVolgorde } from "@/lib/werkgever/menu-volgorde";

// De volgorde van het werkgeversmenu (Site-ontwerper, tabblad Menu, 13 nov): de beheerder versleept de onderdelen van het
// dashboard personeel. Alleen de volgorde; er verdwijnt niets. Zonder eigen volgorde is het menu precies zoals het was.

const kv = vi.hoisted(() => new Map<string, unknown>());
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => kv.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void kv.set(k, v),
  kvDelete: async (k: string) => void kv.delete(k),
}));

import { getMenuVolgorde, resetMenuVolgorde, setMenuVolgorde } from "@/lib/werkgever/menu-volgorde-store";

const bron = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");
const opties: MenuOpties = { heeftAfspraken: true, heeftRijschool: false, heeftHoreca: false, inApp: false, studio: true };
const menu = (o: Partial<MenuOpties> = {}) => menuVoor("personeel", { ...opties, ...o });
const sleutels = (m: MenuPlek[]) => m.map((p) => p.sleutel);
const omgekeerd = () => ({ hoofd: [...HOOFD_STANDAARD].reverse(), beheer: [...BEHEER_STANDAARD].reverse() });

beforeEach(() => kv.clear());

describe("de standaard is het gewone menu", () => {
  it("de lijsten volgen menuVoor: elk onderdeel van het dashboard personeel staat erin, in dezelfde volgorde", () => {
    for (const o of [{}, { heeftAfspraken: false }, { inApp: true }]) {
      const m = menu(o);
      const hoofd = m.filter((p) => !p.sectie && p.sleutel !== "start").map((p) => p.sleutel);
      const beheer = m.filter((p) => p.sectie === "beheer").map((p) => p.sleutel);
      // dezelfde onderlinge volgorde als in de standaardlijst, en niets wat de lijst niet kent
      expect(HOOFD_STANDAARD.filter((s) => hoofd.includes(s))).toEqual(hoofd);
      expect(BEHEER_STANDAARD.filter((s) => beheer.includes(s))).toEqual(beheer);
    }
  });

  it("zonder eigen volgorde komt precies hetzelfde menu terug; de standaardvolgorde verandert ook niets", () => {
    const m = menu();
    expect(pasMenuVolgordeToe(m, null)).toBe(m);
    expect(pasMenuVolgordeToe(m, standaardMenuVolgorde())).toEqual(m);
    expect(isStandaardMenuVolgorde(standaardMenuVolgorde())).toBe(true);
  });

  it("elk onderdeel heeft een naam voor de beheerder", () => {
    for (const s of [...HOOFD_STANDAARD, ...BEHEER_STANDAARD]) expect(MENU_NAAM[s]?.naam.length, s).toBeGreaterThan(2);
    expect(new Set([...HOOFD_STANDAARD, ...BEHEER_STANDAARD]).size).toBe(HOOFD_STANDAARD.length + BEHEER_STANDAARD.length);
  });
});

describe("een eigen volgorde", () => {
  it("verandert alleen de volgorde: er verdwijnt niets en er komt niets bij", () => {
    for (const o of [{}, { heeftAfspraken: false }, { inApp: true }]) {
      const m = menu(o);
      const n = pasMenuVolgordeToe(m, omgekeerd());
      expect([...sleutels(n)].sort()).toEqual([...sleutels(m)].sort());
      expect(n).toHaveLength(m.length);
      // wie klussen heeft, houdt alle personeelsfuncties
      for (const s of PERSONEEL_SLEUTELS) expect(sleutels(n), s).toContain(s);
    }
  });

  it("Jouw start blijft bovenaan, daarna het bovenste deel, daarna Beheer; niets wisselt van deel", () => {
    const m = menu();
    const n = pasMenuVolgordeToe(m, omgekeerd());
    expect(n[0]).toEqual({ sleutel: "start" });
    const eersteBeheer = n.findIndex((p) => p.sectie === "beheer");
    expect(n.slice(1, eersteBeheer).every((p) => !p.sectie)).toBe(true);
    expect(n.slice(eersteBeheer).every((p) => p.sectie === "beheer")).toBe(true);
    expect(n[1]?.sleutel).toBe("geblokkeerd");
    expect(n[eersteBeheer]?.sleutel).toBe("kennisbank");
    for (const p of n) expect(p.sectie, p.sleutel).toBe(m.find((x) => x.sleutel === p.sleutel)?.sectie);
  });

  it("onbekende, dubbele en verkeerd geplaatste onderdelen vallen weg; wat ontbreekt komt achteraan", () => {
    const v = normalizeMenuVolgorde({ hoofd: ["mail", "mail", "constructor", "uren", 4, "klussen"], beheer: ["klussen", "facturen", "toString"] });
    expect(v.hoofd.slice(0, 2)).toEqual(["mail", "klussen"]);
    expect(v.hoofd).toHaveLength(HOOFD_STANDAARD.length);
    expect(v.hoofd).not.toContain("uren" as MenuSleutel);
    expect(v.beheer[0]).toBe("facturen");
    expect(v.beheer).not.toContain("klussen" as MenuSleutel);
    expect(v.beheer).toHaveLength(BEHEER_STANDAARD.length);
  });

  it("onleesbare invoer geeft de standaard", () => {
    for (const raw of [null, undefined, "x", 3, [], { hoofd: "x", beheer: 4 }]) expect(normalizeMenuVolgorde(raw)).toEqual(standaardMenuVolgorde());
  });

  it("een onderdeel dat de volgorde niet kent, blijft in het menu staan", () => {
    const m: MenuPlek[] = [{ sleutel: "start" }, { sleutel: "klussen" }, { sleutel: "website" }, { sleutel: "mail" }];
    expect(sleutels(pasMenuVolgordeToe(m, { hoofd: ["mail", "klussen"], beheer: [] }))).toEqual(["start", "mail", "klussen", "website"]);
  });
});

describe("de opslag", () => {
  it("geen eigen versie = null; bewaren en teruglezen; gelijk aan de standaard wist de sleutel", async () => {
    expect(await getMenuVolgorde()).toBeNull();
    const eigen = await setMenuVolgorde(omgekeerd());
    expect(eigen?.hoofd[0]).toBe("geblokkeerd");
    expect((await getMenuVolgorde())?.beheer[0]).toBe("kennisbank");
    expect(await setMenuVolgorde(standaardMenuVolgorde())).toBeNull();
    expect(kv.has("ontwerp:werkgever-menu")).toBe(false);
  });

  it("terug naar de standaard", async () => {
    await setMenuVolgorde(omgekeerd());
    await resetMenuVolgorde();
    expect(await getMenuVolgorde()).toBeNull();
  });
});

describe("de layout, het paneel en de route", () => {
  it("de layout past de volgorde alleen toe op het dashboard personeel, en een storing geeft het gewone menu", () => {
    const layout = bron("app/werkgever/layout.tsx");
    expect(layout).toContain('const menuVolgorde = werkruimte.soort === "personeel" ? await getMenuVolgorde().catch(() => null) : null;');
    expect(layout).toContain("const nav: NavItem[] = pasMenuVolgordeToe(");
    // de schakelaars (netwerk, kennisbank, op locatie) filteren daarna nog steeds
    expect(layout.indexOf("pasMenuVolgordeToe(")).toBeLessThan(layout.indexOf('.filter(({ sleutel }) => sleutel !== "netwerk" || netwerkAan)'));
  });

  it("het paneel staat in het tabblad Menu, met verslepen, en laadt geen servercode", () => {
    expect(bron("components/admin/ontwerper/Ontwerper.tsx")).toContain("<WerkgeverMenuPaneel />");
    const paneel = bron("components/admin/ontwerper/WerkgeverMenuPaneel.tsx");
    expect(paneel).toContain("{...sleep.lijst}");
    expect(paneel).toContain("<SleepGreep");
    expect(paneel).toContain('import type { MenuDeel, MenuVolgorde } from "@/lib/werkgever/menu-volgorde";');
    expect(paneel).not.toContain("menu-volgorde-store");
    expect(paneel).not.toContain("lib/werkgever/werkruimte");
  });

  it("de route is alleen voor de platformbeheerder", () => {
    const route = bron("app/api/admin/ontwerp/werkgever-menu/route.ts");
    expect(route.match(/withAdminAccess\(\["PLATFORM_ADMIN"\]/g) ?? []).toHaveLength(3);
  });
});
