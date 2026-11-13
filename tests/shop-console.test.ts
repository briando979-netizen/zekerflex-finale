import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CONSOLE_GROEPEN, consoleTaken, type ConsoleStand } from "@/lib/shop/console";
import { ADMIN_HUBS } from "@/lib/admin/nav";
import { isOntwerperTab } from "@/lib/ontwerp/tabs";

// De Webshop-console (Beheer → Webshop & merk, 13 nov): één startpagina voor de webshop. Alleen echte cijfers, een eerlijke
// melding als betalen dicht staat, en geen dode links.

const bron = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");
const GOED: ConsoleStand = { betalen: true, zichtbaar: 30, uit: 0, zonderFoto: 0, lageVoorraad: 0, pogingen30: 6, betaald30: 4, omzet30Cents: 12000 };

describe("wat nu te doen", () => {
  it("alles in orde = niets te doen", () => {
    expect(consoleTaken(GOED)).toEqual([]);
    // nog niet gemeten is geen storing
    expect(consoleTaken({ ...GOED, betalen: null })).toEqual([]);
  });

  it("betalen dicht staat altijd bovenaan, als eerste en in het rood", () => {
    const t = consoleTaken({ ...GOED, betalen: false, zichtbaar: 0, uit: 28, zonderFoto: 3, lageVoorraad: 2, betaald30: 0 });
    expect(t[0]).toMatchObject({ id: "betalen", toon: "crit", href: "/admin/te-doen" });
    expect(t.map((x) => x.id)).toEqual(["betalen", "leeg", "geen-betaling", "foto", "voorraad", "concepten"]);
  });

  it("bestelpogingen zonder betaling vallen op; zonder pogingen niet", () => {
    expect(consoleTaken({ ...GOED, pogingen30: 7, betaald30: 0 }).map((x) => x.id)).toEqual(["geen-betaling"]);
    expect(consoleTaken({ ...GOED, pogingen30: 0, betaald30: 0 })).toEqual([]);
  });

  it("enkelvoud en meervoud kloppen", () => {
    expect(consoleTaken({ ...GOED, uit: 1 })[0]?.titel).toBe("1 product staat uit");
    expect(consoleTaken({ ...GOED, uit: 28 })[0]?.titel).toBe("28 producten staan uit");
    expect(consoleTaken({ ...GOED, zonderFoto: 1 })[0]?.titel).toBe("1 zichtbaar product heeft geen foto");
    expect(consoleTaken({ ...GOED, pogingen30: 1, betaald30: 0 })[0]?.titel).toBe("1 bestelpoging in 30 dagen, geen enkele betaald");
  });
});

describe("de tegels", () => {
  it("elke tegel en elke taak wijst naar een pagina die bestaat", () => {
    const inMenu = new Set(ADMIN_HUBS.flatMap((h) => h.pages.map((p) => p.href)));
    const adressen = [...CONSOLE_GROEPEN.flatMap((g) => g.tegels.map((t) => t.href)), ...consoleTaken({ ...GOED, betalen: false, zichtbaar: 0, uit: 2, zonderFoto: 1, lageVoorraad: 1, betaald30: 0 }).map((t) => t.href)];
    for (const a of adressen) {
      const [pad, zoek] = a.split("?");
      if (pad === "/shop") {
        expect(existsSync(path.join(process.cwd(), "app/shop/page.tsx"))).toBe(true);
        continue;
      }
      expect(inMenu.has(pad ?? ""), a).toBe(true);
      if (zoek) {
        expect(pad).toBe("/admin/ontwerper");
        expect(isOntwerperTab(new URLSearchParams(zoek).get("tab")), a).toBe(true);
      }
    }
  });

  it("geen dubbele titels, elke uitleg is een zin, en alleen de webshop zelf opent buiten het beheer", () => {
    const tegels = CONSOLE_GROEPEN.flatMap((g) => g.tegels);
    expect(new Set(tegels.map((t) => t.titel)).size).toBe(tegels.length);
    for (const t of tegels) expect(t.uitleg.endsWith("."), t.titel).toBe(true);
    expect(tegels.filter((t) => t.buiten).map((t) => t.href)).toEqual(["/shop"]);
    expect(tegels.length).toBeGreaterThan(10);
  });
});

describe("de pagina", () => {
  const src = bron("app/admin/webshop/page.tsx");

  it("is alleen voor de platformbeheerder en staat in het menu, bovenaan Webshop & merk", () => {
    expect(src).toContain('hasRole(principal, "PLATFORM_ADMIN")');
    const merk = ADMIN_HUBS.find((h) => h.id === "merk");
    expect(merk?.pages[0]).toEqual({ href: "/admin/webshop", label: "Webshop-console" });
  });

  it("alleen lezen: tellen en optellen, niets schrijven", () => {
    expect(src).not.toMatch(/\.(create|update|delete|upsert|createMany|updateMany|deleteMany)\(/);
    // omzet telt alleen bestellingen die echt betaald zijn
    expect(src).toContain('const BETAALD = ["RECEIVED", "CONFIRMED", "SHIPPED"] as const;');
    expect(src).toContain("status: { in: [...BETAALD] }");
  });

  it("zegt eerlijk dat betalen dicht staat, en schat niets als er niet gemeten is", () => {
    expect(src).toContain("Klanten kunnen nu niet betalen: het betaalaccount bij Stripe staat dicht");
    expect(src).toContain('s.betalen === null ? "—"');
    // tijden in Nederlandse tijd
    expect(src).toContain('timeZone: "Europe/Amsterdam"');
  });

  it("de wegwijzer brengt je naar de console", () => {
    expect(bron("lib/ontwerp/wegwijzer.ts")).toContain('doel: { pagina: "/admin/webshop" }');
  });
});
