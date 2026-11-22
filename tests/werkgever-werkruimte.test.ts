import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { leesKeuze, menuVoor, voegToe, type MenuOpties, type Werkruimte, type WerkruimteKeuze } from "@/lib/werkgever/werkruimte";

// Het menu van de werkgevers-app. Van 10 tot 22 nov 2026 had een bedrijf ook dashboards voor website, webshop, rijschool en
// horeca; die zijn weg (fase C). Elk bedrijf heeft nu alleen het dashboard personeel; wat een bedrijf bij het aanmelden koos,
// blijft alleen bewaard.

const opties: MenuOpties = { inApp: false };
const sleutels = (o: Partial<MenuOpties> = {}) => menuVoor({ ...opties, ...o }).map((p) => p.sleutel);
const keuze = (soort: Werkruimte, dashboards: Werkruimte[] = [], ookPersoneel = false): WerkruimteKeuze => ({ soort, ookPersoneel, dashboards, at: "2026-11-10T10:00:00.000Z" });

describe("de keuze bij het aanmelden (alleen bewaard)", () => {
  it("accepteert alleen bekende dashboards", () => {
    expect(leesKeuze({ soort: "rijschool", ookPersoneel: true, at: "x" })).toEqual({ soort: "rijschool", ookPersoneel: true, dashboards: [], at: "x" });
    expect(leesKeuze({ soort: "webshop", dashboards: ["kapper", "website", "webshop", "website"] })).toEqual({ soort: "webshop", ookPersoneel: false, dashboards: ["website", "webshop"], at: "" });
    expect(leesKeuze({ soort: "kapper" })).toBeNull();
    expect(leesKeuze("rijschool")).toBeNull();
    expect(leesKeuze(null)).toBeNull();
  });

  it("een dashboard toevoegen houdt de bestaande en maakt het nieuwe het standaarddashboard", () => {
    expect(voegToe(null, "webshop", "t")).toEqual({ soort: "webshop", ookPersoneel: false, dashboards: ["webshop"], at: "t" });
    const oud = keuze("rijschool", ["rijschool"], true);
    expect(voegToe(oud, "horeca", "t")).toEqual({ soort: "horeca", ookPersoneel: true, dashboards: ["personeel", "rijschool", "horeca"], at: "t" });
  });

  it("het startscherm en het menu kijken niet meer naar die keuze", () => {
    const s = readFileSync(path.join(process.cwd(), "lib/werkgever/werkruimte-server.ts"), "utf8");
    expect(s).not.toMatch(/rijschool|horecaZaak|siteOfTenant|zf_dashboard/);
  });
});

describe("menuVoor", () => {
  it("alleen personeel inhuren", () => {
    expect(menuVoor(opties)).toEqual([
      { sleutel: "start" },
      { sleutel: "klussen" },
      { sleutel: "kalender" },
      { sleutel: "planner" },
      { sleutel: "agenda" },
      // ZekerFlex Bank staat uit (lib/app-mode.ts, BANK_AAN): geen "bank"
      { sleutel: "favorieten" },
      { sleutel: "berichten" },
      { sleutel: "assistent" },
      { sleutel: "geblokkeerd" },
      { sleutel: "uren", sectie: "beheer" },
      { sleutel: "inchecken", sectie: "beheer" },
      { sleutel: "facturen", sectie: "beheer" },
      { sleutel: "rapportages", sectie: "beheer" },
      { sleutel: "inkaart", sectie: "beheer" },
      { sleutel: "compliance", sectie: "beheer" },
      { sleutel: "overeenkomsten", sectie: "beheer" },
      { sleutel: "bedrijf", sectie: "beheer" },
      { sleutel: "kennisbank", sectie: "beheer" },
      { sleutel: "hulp", sectie: "beheer" },
    ]);
    expect(sleutels({ inApp: true })).not.toContain("bank");
  });

  it("de onderdelen buiten flexwerk staan er niet meer in, ook niet zonder de vlag", () => {
    for (const vlag of [false, true]) {
      const menu: string[] = sleutels({ alleenFlexwerk: vlag });
      for (const weg of ["rijschool", "horeca", "studio", "winkel", "website", "telefonie", "reviews", "netwerk", "locatie", "branche", "afspraken", "klanten", "mail", "whatsapp"]) {
        expect(menu, `${weg} (vlag ${vlag})`).not.toContain(weg);
      }
      expect(menu).toContain("klussen");
      expect(menu).toContain("facturen");
    }
  });

  it("een vaste plek voor het hulpcentrum van bedrijven, direct na de handleidingen", () => {
    const s = sleutels();
    expect(s.indexOf("hulp")).toBe(s.indexOf("kennisbank") + 1);
  });

  it("geen dubbele onderdelen", () => {
    for (const o of [{}, { uitzendPartner: true }, { alleenFlexwerk: true }, { alleenFlexwerk: true, nogGeenKlussen: true }]) {
      const s = sleutels(o);
      expect(new Set(s).size).toBe(s.length);
    }
  });
});
