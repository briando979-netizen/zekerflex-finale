import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { leesIdee } from "@/lib/sites/idee";
import { SECTOR_TEMPLATES } from "@/lib/sites/types";
import { WEBSHOP_TEMPLATES } from "@/lib/sites/webshop-templates";

// "Vertel je idee" in de Studio (13 nov): uit een zin het startpunt, de naam en de plaats halen. Zonder AI, in de browser.

const bron = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");
const SITES = SECTOR_TEMPLATES.map((t) => t.id);
const SHOPS = WEBSHOP_TEMPLATES.map((t) => t.id);

describe("het startpunt", () => {
  it("een website: de branche uit de zin", () => {
    expect(leesIdee("Ik wil een website voor mijn kapsalon", "website", SITES)?.templateId).toBe("kapper");
    expect(leesIdee("een site voor ons schildersbedrijf en stukadoorswerk", "website", SITES)?.templateId).toBe("bouw");
    expect(leesIdee("Website voor een café met lunch", "website", SITES)?.templateId).toBe("horeca");
    expect(leesIdee("wij doen schoonmaak van kantoren", "website", SITES)?.templateId).toBe("schoonmaak");
    expect(leesIdee("praktijk voor fysiotherapie", "website", SITES)?.templateId).toBe("zorg");
    expect(leesIdee("APK en banden bij onze garage", "website", SITES)?.templateId).toBe("garage");
    expect(leesIdee("koeriersdienst en transport", "website", SITES)?.templateId).toBe("logistiek");
  });

  it("een webshop: het soort product uit de zin", () => {
    expect(leesIdee("een webshop voor handgemaakte sieraden", "webshop", SHOPS)?.templateId).toBe("mode");
    expect(leesIdee("ik verkoop koffie en thee", "webshop", SHOPS)?.templateId).toBe("eten");
    expect(leesIdee("kaarsen, planten en cadeaus", "webshop", SHOPS)?.templateId).toBe("wonen");
    expect(leesIdee("natuurlijke zeep en shampoo", "webshop", SHOPS)?.templateId).toBe("beauty");
    expect(leesIdee("gereedschap en onderdelen voor monteurs", "webshop", SHOPS)?.templateId).toBe("vakwinkel");
  });

  it("niets herkend: de algemene keuze, en dat zeggen we erbij", () => {
    const u = leesIdee("iets heel bijzonders", "website", SITES);
    expect(u?.templateId).toBe("algemeen");
    expect(u?.herkend).toBe(false);
    expect(leesIdee("iets heel bijzonders", "webshop", ["mode", "eten"])?.templateId).toBe("mode");
  });

  it("alleen startpunten die het scherm aanbiedt, en elk woordlijstje hoort bij een bestaand startpunt", () => {
    expect(leesIdee("mijn kapsalon", "website", ["algemeen", "bouw"])?.templateId).toBe("algemeen");
    const src = bron("lib/sites/idee.ts");
    const blok = (naam: string) => src.slice(src.indexOf(`const ${naam}: `), src.indexOf("};", src.indexOf(`const ${naam}: `)));
    const sleutels = (b: string) => [...b.matchAll(/^ {2}([a-z]+): \[/gm)].map((m) => m[1]);
    for (const id of sleutels(blok("WEBSITE"))) expect(SITES, id).toContain(id);
    for (const id of sleutels(blok("WEBSHOP"))) expect(SHOPS, id).toContain(id);
    expect(sleutels(blok("WEBSITE")).length).toBeGreaterThan(5);
    expect(sleutels(blok("WEBSHOP")).length).toBeGreaterThan(4);
  });

  it("een lege of te korte zin geeft niets", () => {
    for (const t of ["", "  ", "ab"]) expect(leesIdee(t, "website", SITES)).toBeNull();
  });
});

describe("de naam en de plaats", () => {
  it("na 'heet' of tussen aanhalingstekens, en de plaats na 'in'", () => {
    const u = leesIdee("Een webshop voor handgemaakte sieraden, hij heet Zilverlicht, in Utrecht.", "webshop", SHOPS);
    expect(u).toMatchObject({ templateId: "mode", naam: "Zilverlicht", plaats: "Utrecht", herkend: true });
    expect(leesIdee('Een website voor mijn kapsalon "Knip & Zo" in Den Haag', "website", SITES)).toMatchObject({ naam: "Knip & Zo", plaats: "Den Haag" });
    expect(leesIdee("mijn bakkerij heet De Gouden Korst in Zwolle en verkoopt brood", "website", SITES)).toMatchObject({ naam: "De Gouden Korst", plaats: "Zwolle" });
  });

  it("niets genoemd = leeg, en een land is geen plaats", () => {
    expect(leesIdee("een webshop in kleding", "webshop", SHOPS)).toMatchObject({ naam: "", plaats: "" });
    expect(leesIdee("wij leveren in Nederland", "webshop", SHOPS)?.plaats).toBe("");
  });

  it("lange invoer wordt afgekapt en breekt niets", () => {
    const u = leesIdee(`kapsalon ${"x".repeat(5000)}`, "website", SITES);
    expect(u?.templateId).toBe("kapper");
    expect((leesIdee(`hij heet ${"A".repeat(300)}`, "website", SITES)?.naam ?? "").length).toBeLessThanOrEqual(100);
  });
});

describe("het scherm", () => {
  it("staat boven het startformulier van de webshop en van de website, en overschrijft niets wat al ingevuld is", () => {
    for (const [f, soort] of [["components/studio/WebshopStart.tsx", "webshop"], ["components/app/SiteBuilder.tsx", "website"]] as const) {
      const src = bron(f);
      expect(src, f).toContain(`<IdeeKaart soort="${soort}"`);
      expect(src, f).toContain("naam: b.naam.trim() ? b.naam : u.naam, plaats: b.plaats.trim() ? b.plaats : u.plaats");
      expect(src.indexOf("<IdeeKaart"), f).toBeLessThan(src.indexOf("1. Kies"));
    }
  });

  it("de kaart leest in de browser: geen verzoek naar de server, geen opslag, en de microfoon alleen als de browser hem heeft", () => {
    const kaart = bron("components/studio/IdeeKaart.tsx");
    expect(kaart).not.toContain("fetch(");
    expect(kaart).not.toContain("localStorage");
    expect(kaart).toContain("{kanSpreken ? (");
    expect(kaart).toContain('h.lang = "nl-NL";');
    // de regels zijn puur en veilig voor oude Safari
    const regels = bron("lib/sites/idee.ts");
    expect(regels).not.toMatch(/^import /m);
    expect(regels).not.toMatch(/\(\?<[=!]/);
  });
});
