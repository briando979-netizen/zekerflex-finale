import { describe, expect, it } from "vitest";
import {
  PAKKET_SLEUTELS,
  PERSONEEL_SLEUTELS,
  WERKRUIMTES,
  bepaalWerkruimte,
  dashboardsVan,
  leesKeuze,
  menuVoor,
  thuisVan,
  voegToe,
  type MenuOpties,
  type Werkruimte,
  type WerkruimteFeiten,
  type WerkruimteKeuze,
} from "@/lib/werkgever/werkruimte";
import { RIJSCHOOL_TABS } from "@/lib/rijschool/tabs";
import { horecaTabs } from "@/lib/horeca/tabs";

// De dashboards van een bedrijf (10 nov 2026, eigenaar): personeel, rijschool, horeca, website en webshop,
// elk met een eigen menu; het gewone werkgeversdashboard houdt alleen personeel inhuren.

const geen: WerkruimteFeiten = { keuze: null, heeftRijschool: false, heeftHoreca: false, heeftSite: false, heeftKlussen: false };
const opties: MenuOpties = { heeftRijschool: true, heeftHoreca: true, horecaModules: [], inApp: false, studio: true };
const sleutels = (soort: Werkruimte, o: Partial<MenuOpties> = {}) => menuVoor(soort, { ...opties, ...o }).map((p) => p.sleutel);
const keuze = (soort: Werkruimte, dashboards: Werkruimte[] = [], ookPersoneel = false): WerkruimteKeuze => ({ soort, ookPersoneel, dashboards, at: "2026-11-10T10:00:00.000Z" });

describe("bepaalWerkruimte zonder keuze", () => {
  it("leidt het dashboard af uit wat het bedrijf al gebruikt", () => {
    expect(bepaalWerkruimte(geen)).toEqual({ soort: "personeel", ookPersoneel: true, gekozen: false, dashboards: ["personeel"] });
    expect(bepaalWerkruimte({ ...geen, heeftRijschool: true })).toEqual({ soort: "rijschool", ookPersoneel: false, gekozen: false, dashboards: ["rijschool"] });
    expect(bepaalWerkruimte({ ...geen, heeftHoreca: true }).soort).toBe("horeca");
    expect(bepaalWerkruimte({ ...geen, heeftSite: true }).soort).toBe("website");
    expect(bepaalWerkruimte({ ...geen, heeftWebshop: true }).soort).toBe("webshop");
    expect(bepaalWerkruimte({ ...geen, heeftSite: true, heeftWebshop: true }).dashboards).toEqual(["website", "webshop"]);
  });

  it("een bedrijf met klussen en een website opent met personeel en heeft allebei", () => {
    const stand = bepaalWerkruimte({ ...geen, heeftSite: true, heeftKlussen: true });
    expect(stand.soort).toBe("personeel");
    expect(stand.dashboards).toEqual(["personeel", "website"]);
  });

  it("wie klussen heeft of de horeca-module personeel gebruikt, houdt het dashboard personeel", () => {
    expect(bepaalWerkruimte({ ...geen, heeftRijschool: true, heeftKlussen: true }).dashboards).toEqual(["personeel", "rijschool"]);
    expect(bepaalWerkruimte({ ...geen, heeftHoreca: true, personeelModule: true }).ookPersoneel).toBe(true);
    expect(bepaalWerkruimte({ ...geen, heeftHoreca: true }).ookPersoneel).toBe(false);
  });
});

describe("bepaalWerkruimte met een keuze en een open dashboard", () => {
  it("de keuze van het bedrijf wint van wat we afleiden", () => {
    expect(bepaalWerkruimte({ ...geen, heeftRijschool: true, keuze: keuze("webshop") })).toEqual({
      soort: "webshop",
      ookPersoneel: false,
      gekozen: true,
      dashboards: ["rijschool", "webshop"],
    });
    expect(bepaalWerkruimte({ ...geen, keuze: keuze("horeca", [], true) }).dashboards).toEqual(["personeel", "horeca"]);
  });

  it("het dashboard dat deze browser open had, telt alleen als het bedrijf het heeft", () => {
    const f: WerkruimteFeiten = { ...geen, heeftKlussen: true, keuze: keuze("rijschool", ["personeel", "rijschool"]) };
    expect(bepaalWerkruimte(f, "personeel").soort).toBe("personeel");
    expect(bepaalWerkruimte(f, "webshop").soort).toBe("rijschool");
    expect(bepaalWerkruimte(f, null).soort).toBe("rijschool");
    // zonder keuze: het gewenste dashboard als het bedrijf het gebruikt
    expect(bepaalWerkruimte({ ...geen, heeftKlussen: true, heeftSite: true }, "website").soort).toBe("website");
  });

  it("niets wat iemand gebruikt, verdwijnt uit de wisselaar", () => {
    const f: WerkruimteFeiten = { keuze: keuze("website"), heeftRijschool: true, heeftHoreca: true, heeftSite: false, heeftWebshop: true, heeftKlussen: true };
    expect(dashboardsVan(f)).toEqual(["personeel", "rijschool", "horeca", "website", "webshop"]);
  });
});

describe("leesKeuze en voegToe", () => {
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

  it("elk dashboard begint in zijn eigen omgeving", () => {
    expect(WERKRUIMTES.map(thuisVan)).toEqual(["/werkgever", "/werkgever/rijschool", "/werkgever/horeca", "/studio/website", "/studio/webshop"]);
  });
});

describe("menuVoor", () => {
  it("het dashboard personeel heeft alleen personeel inhuren, zonder de andere pakketten", () => {
    expect(menuVoor("personeel", opties)).toEqual([
      { sleutel: "start" },
      { sleutel: "klussen" },
      { sleutel: "kalender" },
      { sleutel: "planner" },
      { sleutel: "agenda" },
      // ZekerFlex Bank staat uit (lib/app-mode.ts, BANK_AAN): geen "bank"
      { sleutel: "favorieten" },
      { sleutel: "berichten" },
      { sleutel: "assistent" },
      { sleutel: "mail" },
      { sleutel: "whatsapp" },
      { sleutel: "geblokkeerd" },
      { sleutel: "uren", sectie: "beheer" },
      { sleutel: "inchecken", sectie: "beheer" },
      { sleutel: "facturen", sectie: "beheer" },
      { sleutel: "rapportages", sectie: "beheer" },
      { sleutel: "compliance", sectie: "beheer" },
      { sleutel: "overeenkomsten", sectie: "beheer" },
      { sleutel: "bedrijf", sectie: "beheer" },
      { sleutel: "telefonie", sectie: "beheer" },
      { sleutel: "reviews", sectie: "beheer" },
      { sleutel: "netwerk", sectie: "beheer" },
      { sleutel: "locatie", sectie: "beheer" },
      { sleutel: "kennisbank", sectie: "beheer" },
    ]);
    // ook met een rijschool en een horecazaak: die staan in hun eigen dashboard
    for (const s of PAKKET_SLEUTELS) expect(sleutels("personeel"), `personeel bevat ${s}`).not.toContain(s);
    for (const soort of WERKRUIMTES) expect(sleutels(soort, { inApp: true })).not.toContain("bank");
  });

  it("de andere dashboards hebben geen personeelsfuncties", () => {
    for (const soort of ["rijschool", "horeca", "website", "webshop"] as const) {
      for (const s of PERSONEEL_SLEUTELS) expect(sleutels(soort), `${soort} bevat ${s}`).not.toContain(s);
      // wel contact en administratie
      for (const s of ["mail", "whatsapp", "telefonie", "reviews", "facturen", "bedrijf"] as const) expect(sleutels(soort), `${soort} mist ${s}`).toContain(s);
    }
  });

  it("rijschool: elk tabblad van het beheer is een eigen onderdeel; nog niet ingericht: één ingang", () => {
    const menu = menuVoor("rijschool", opties).filter((p) => p.sleutel === "rijschool");
    expect(menu.map((p) => p.tab?.id)).toEqual(RIJSCHOOL_TABS.map((t) => t.id));
    expect(menuVoor("rijschool", { ...opties, heeftRijschool: false }).filter((p) => p.sleutel === "rijschool")).toEqual([{ sleutel: "rijschool" }]);
  });

  it("horeca: de tabbladen volgen de modules die aan staan", () => {
    const tabs = (modules: string[]) => menuVoor("horeca", { ...opties, horecaModules: modules }).flatMap((p) => (p.sleutel === "horeca" && p.tab ? [p.tab.id] : []));
    expect(tabs([])).toEqual(horecaTabs([]).map((t) => t.id));
    expect(tabs(["reserveren", "bestellen"])).toEqual(expect.arrayContaining(["reserveringen", "bestellingen", "tafels", "cijfers"]));
    expect(tabs([])).not.toContain("reserveringen");
    expect(menuVoor("horeca", { ...opties, heeftHoreca: false }).filter((p) => p.sleutel === "horeca")).toEqual([{ sleutel: "horeca" }]);
  });

  it("website en webshop openen de eigen studio; zonder studio-recht de start", () => {
    expect(sleutels("website")[0]).toBe("studio");
    expect(sleutels("webshop")[0]).toBe("winkel");
    expect(sleutels("website", { studio: false })[0]).toBe("start");
  });

  it("geen dubbele onderdelen in een menu", () => {
    for (const soort of WERKRUIMTES) {
      const adressen = menuVoor(soort, { ...opties, horecaModules: ["reserveren", "bestellen", "kassa", "taken"] }).map((p) => `${p.sleutel}?${p.tab?.id ?? ""}`);
      expect(new Set(adressen).size, `${soort} dubbel`).toBe(adressen.length);
    }
  });
});
