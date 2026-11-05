import { describe, expect, it } from "vitest";
import {
  PERSONEEL_SLEUTELS,
  WERKRUIMTES,
  bepaalWerkruimte,
  leesKeuze,
  menuVoor,
  type MenuOpties,
  type WerkruimteFeiten,
} from "@/lib/werkgever/werkruimte";

const geen: WerkruimteFeiten = { keuze: null, heeftRijschool: false, heeftHoreca: false, heeftSite: false, heeftKlussen: false };
const opties: MenuOpties = { ookPersoneel: true, heeftRijschool: false, heeftHoreca: false, inApp: false, studio: true };
const sleutels = (soort: Parameters<typeof menuVoor>[0], o: Partial<MenuOpties> = {}) => menuVoor(soort, { ...opties, ...o }).map((p) => p.sleutel);

describe("bepaalWerkruimte zonder keuze", () => {
  it("leidt de soort af uit wat het bedrijf al gebruikt", () => {
    expect(bepaalWerkruimte(geen)).toEqual({ soort: "personeel", ookPersoneel: true, gekozen: false });
    expect(bepaalWerkruimte({ ...geen, heeftRijschool: true })).toEqual({ soort: "rijschool", ookPersoneel: false, gekozen: false });
    expect(bepaalWerkruimte({ ...geen, heeftHoreca: true }).soort).toBe("horeca");
    expect(bepaalWerkruimte({ ...geen, heeftSite: true }).soort).toBe("website");
  });

  it("een bedrijf met klussen en een website blijft het gewone dashboard houden", () => {
    expect(bepaalWerkruimte({ ...geen, heeftSite: true, heeftKlussen: true }).soort).toBe("personeel");
  });

  it("wie klussen heeft of de horeca-module personeel gebruikt, houdt alle personeelsfuncties", () => {
    expect(bepaalWerkruimte({ ...geen, heeftRijschool: true, heeftKlussen: true }).ookPersoneel).toBe(true);
    expect(bepaalWerkruimte({ ...geen, heeftHoreca: true, personeelModule: true }).ookPersoneel).toBe(true);
    expect(bepaalWerkruimte({ ...geen, heeftHoreca: true }).ookPersoneel).toBe(false);
  });
});

describe("bepaalWerkruimte met een keuze", () => {
  const keuze = (soort: (typeof WERKRUIMTES)[number], ookPersoneel = false) => ({ soort, ookPersoneel, at: "2026-11-04T10:00:00.000Z" });

  it("de keuze van het bedrijf wint van wat we afleiden", () => {
    expect(bepaalWerkruimte({ ...geen, heeftRijschool: true, keuze: keuze("website") })).toEqual({ soort: "website", ookPersoneel: false, gekozen: true });
    expect(bepaalWerkruimte({ ...geen, keuze: keuze("horeca", true) }).ookPersoneel).toBe(true);
  });

  it("personeel uitzetten verbergt niets voor wie al klussen heeft", () => {
    expect(bepaalWerkruimte({ ...geen, heeftKlussen: true, keuze: keuze("rijschool", false) }).ookPersoneel).toBe(true);
    expect(bepaalWerkruimte({ ...geen, keuze: keuze("personeel", false) }).ookPersoneel).toBe(true);
  });
});

describe("leesKeuze", () => {
  it("accepteert alleen een bekende soort", () => {
    expect(leesKeuze({ soort: "rijschool", ookPersoneel: true, at: "x" })).toEqual({ soort: "rijschool", ookPersoneel: true, at: "x" });
    expect(leesKeuze({ soort: "kapper" })).toBeNull();
    expect(leesKeuze("rijschool")).toBeNull();
    expect(leesKeuze(null)).toBeNull();
    expect(leesKeuze({ soort: "website", ookPersoneel: "ja" })).toEqual({ soort: "website", ookPersoneel: false, at: "" });
  });
});

describe("menuVoor", () => {
  it("het gewone menu blijft precies zoals het was", () => {
    expect(menuVoor("personeel", opties)).toEqual([
      { sleutel: "start" },
      { sleutel: "klussen" },
      { sleutel: "kalender" },
      { sleutel: "agenda" },
      { sleutel: "bank" },
      { sleutel: "favorieten" },
      { sleutel: "berichten" },
      { sleutel: "mail" },
      { sleutel: "whatsapp" },
      { sleutel: "geblokkeerd" },
      { sleutel: "uren", sectie: "beheer" },
      { sleutel: "facturen", sectie: "beheer" },
      { sleutel: "compliance", sectie: "beheer" },
      { sleutel: "overeenkomsten", sectie: "beheer" },
      { sleutel: "bedrijf", sectie: "beheer" },
      { sleutel: "website", sectie: "beheer" },
      { sleutel: "telefonie", sectie: "beheer" },
      { sleutel: "reviews", sectie: "beheer" },
      { sleutel: "netwerk", sectie: "beheer" },
    ]);
    // pakketten die aanstaan direct na de start, zoals voorheen (horeca vóór rijschool)
    expect(sleutels("personeel", { heeftRijschool: true, heeftHoreca: true }).slice(0, 4)).toEqual(["start", "horeca", "rijschool", "klussen"]);
    expect(sleutels("personeel", { inApp: true })).not.toContain("bank");
  });

  it("elke werkruimte zet het eigen onderdeel direct na de start", () => {
    expect(sleutels("rijschool")[1]).toBe("rijschool");
    expect(sleutels("horeca")[1]).toBe("horeca");
    expect(sleutels("website")[1]).toBe("studio");
    expect(sleutels("website", { studio: false })[1]).toBe("website");
  });

  it("met personeel blijft elke functie van het gewone menu bereikbaar, zonder dubbele", () => {
    const gewoon = sleutels("personeel");
    for (const soort of WERKRUIMTES) {
      for (const studio of [true, false]) {
        const menu = sleutels(soort, { studio });
        expect(new Set(menu).size, `${soort} dubbel`).toBe(menu.length);
        expect(menu[0]).toBe("start");
        for (const s of gewoon) expect(menu, `${soort} mist ${s}`).toContain(s);
      }
    }
  });

  it("zonder personeel staat er één ingang om een klus te plaatsen", () => {
    for (const soort of ["rijschool", "horeca", "website"] as const) {
      const menu = menuVoor(soort, { ...opties, ookPersoneel: false });
      for (const s of PERSONEEL_SLEUTELS) expect(menu.map((p) => p.sleutel)).not.toContain(s);
      expect(menu.filter((p) => p.sleutel === "inhuren")).toEqual([{ sleutel: "inhuren", sectie: "personeel" }]);
      // de rest (contact, website, administratie) blijft
      for (const s of ["berichten", "mail", "whatsapp", "agenda", "website", "reviews", "telefonie", "netwerk", "facturen", "bank", "bedrijf"] as const) {
        expect(menu.map((p) => p.sleutel), `${soort} mist ${s}`).toContain(s);
      }
    }
  });

  it("een tweede pakket dat aanstaat blijft in het menu", () => {
    expect(sleutels("rijschool", { heeftHoreca: true })).toContain("horeca");
    expect(sleutels("horeca", { heeftRijschool: true })).toContain("rijschool");
    expect(sleutels("website", { heeftRijschool: true, heeftHoreca: true })).toEqual(expect.arrayContaining(["rijschool", "horeca"]));
    expect(sleutels("rijschool", { inApp: true })).not.toContain("bank");
  });
});
