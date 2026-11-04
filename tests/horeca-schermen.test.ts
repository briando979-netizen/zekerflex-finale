import { describe, expect, it } from "vitest";
import { KOPPEL_LENGTE, KOPPEL_TEKENS, SCHERMEN, SCHERM_ACTIES, SCHERM_ROLLEN, leesKoppelcode, magActie, maakKoppelcode, schermBeschikbaar, stationVan, toonKoppelcode } from "@/lib/horeca/schermen";
import { schermActieSchema } from "@/lib/horeca/schema";

describe("horeca-schermen", () => {
  it("elk scherm staat in de catalogus met naam, apparaten en geldige acties", () => {
    for (const rol of SCHERM_ROLLEN) {
      const s = SCHERMEN[rol];
      expect(s.rol).toBe(rol);
      expect(s.naam.length).toBeGreaterThan(2);
      expect(s.apparaten.length).toBeGreaterThan(0);
      expect(s.acties.every((a) => (SCHERM_ACTIES as readonly string[]).includes(a))).toBe(true);
    }
  });

  it("elke schermactie heeft een schema (de API leest hem)", () => {
    const opties = schermActieSchema.options.map((o) => o.shape.actie.value as string);
    expect([...opties].sort()).toEqual([...SCHERM_ACTIES].sort());
  });

  it("schermen voor gasten of op een tv wijzigen niets", () => {
    expect(SCHERMEN.afhaal.acties).toEqual([]);
    expect(SCHERMEN.overzicht.acties).toEqual([]);
  });

  it("keuken en bar zetten alleen fasen en uitverkocht; de keuken kan geen tafel vrijgeven", () => {
    expect(magActie("keuken", "fase")).toBe(true);
    expect(magActie("keuken", "tafel-vrij")).toBe(false);
    expect(magActie("keuken", "bestelling")).toBe(false);
    expect(magActie("bediening", "bestelling")).toBe(true);
    expect(magActie("ontvangst", "inloop")).toBe(true);
    expect(magActie("uitgifte", "fase")).toBe(false);
  });

  it("de kassa rekent af en verkoopt; alleen met de module Kassa", () => {
    expect(magActie("kassa", "afrekenen")).toBe(true);
    expect(magActie("kassa", "verkoop")).toBe(true);
    expect(magActie("bediening", "afrekenen")).toBe(true);
    expect(magActie("keuken", "afrekenen")).toBe(false);
    expect(schermBeschikbaar("kassa", ["bestellen"])).toBe(false);
    expect(schermBeschikbaar("kassa", ["bestellen", "kassa"])).toBe(true);
  });

  it("keuken en bar hebben hun eigen station", () => {
    expect(stationVan("keuken")).toBe("keuken");
    expect(stationVan("bar")).toBe("bar");
    expect(stationVan("uitgifte")).toBe("alles");
  });

  it("een scherm is er alleen als de module aan staat", () => {
    expect(schermBeschikbaar("keuken", [])).toBe(false);
    expect(schermBeschikbaar("keuken", ["bestellen"])).toBe(true);
    expect(schermBeschikbaar("ontvangst", ["bestellen"])).toBe(false);
    expect(schermBeschikbaar("overzicht", [])).toBe(true);
  });

  it("koppelcodes: zes tekens zonder 0/O/1/I/L, netjes ingelezen", () => {
    let i = 0;
    const reeks = [0, 0.5, 0.999, 0.1, 0.7, 0.3];
    const code = maakKoppelcode(() => reeks[i++ % reeks.length] ?? 0);
    expect(code).toHaveLength(KOPPEL_LENGTE);
    expect([...code].every((t) => KOPPEL_TEKENS.includes(t))).toBe(true);
    expect(KOPPEL_TEKENS).not.toMatch(/[01IOL]/);
    expect(leesKoppelcode(` ${toonKoppelcode(code).toLowerCase()} `)).toBe(code);
    expect(leesKoppelcode("ABC-23")).toBeNull();
    expect(leesKoppelcode("ABC-1O0")).toBeNull();
  });
});
