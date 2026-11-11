import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AANBOD } from "@/lib/marketing/aanbod";
import { startHrefVoor, voordeurTegels } from "@/lib/marketing/voordeur";
import { HOME_SECTIES, normalizeHomeIndeling, standaardHomeIndeling, zichtbareSecties } from "@/lib/ontwerp/home";
import { WERKRUIMTES } from "@/lib/werkgever/werkruimte";

describe("voordeur voor bedrijven (Wat wil je doen?)", () => {
  const tegels = voordeurTegels();

  it("heeft precies één tegel per dashboard, in vaste volgorde", () => {
    expect(tegels.map((t) => t.soort)).toEqual(["personeel", "website", "webshop", "horeca", "rijschool"]);
    expect(new Set(tegels.map((t) => t.soort))).toEqual(new Set(WERKRUIMTES));
  });

  it("elke foto bestaat en elke tegel heeft titel, regel en omschrijving van de foto", () => {
    for (const t of tegels) {
      expect(existsSync(join(process.cwd(), "public", t.foto.pad)), t.soort).toBe(true);
      expect(t.titel.length).toBeGreaterThan(3);
      expect(t.regel.length).toBeGreaterThan(20);
      expect(t.foto.alt.length).toBeGreaterThan(15);
    }
  });

  it("Start gaat naar aanmelden voor dat dashboard, en klopt met het aanbod", () => {
    for (const t of tegels) {
      expect(t.startHref).toBe(startHrefVoor(t.soort));
      expect(t.startHref).toBe(`/register?type=bedrijf&dashboard=${t.soort}`);
    }
    for (const soort of ["website", "webshop", "horeca", "rijschool"] as const) {
      expect(AANBOD.find((a) => a.slug === soort)?.start.href).toBe(startHrefVoor(soort));
    }
  });

  it("Meer gaat naar een pagina van het aanbod", () => {
    for (const t of tegels) expect(t.meerHref.startsWith("/")).toBe(true);
  });
});

describe("de voordeur in de indeling van /bedrijven", () => {
  it("staat standaard als eerste blok onder de hero", () => {
    expect(HOME_SECTIES[0]?.id).toBe("voordeur");
    expect(zichtbareSecties(null)[0]).toBe("voordeur");
    expect(standaardHomeIndeling().volgorde[0]).toBe("voordeur");
  });

  it("komt ook bij een eerder bewaarde eigen volgorde vooraan, en laat die volgorde verder ongemoeid", () => {
    const oud = { volgorde: ["aanbod", "hoe", "vragen"], verborgen: ["hoe"], eigen: [] };
    const n = normalizeHomeIndeling(oud);
    expect(n.volgorde[0]).toBe("voordeur");
    expect(n.volgorde.slice(1, 4)).toEqual(["aanbod", "hoe", "vragen"]);
    expect(n.verborgen).toEqual(["hoe"]);
  });

  it("een verborgen voordeur blijft verborgen", () => {
    const n = normalizeHomeIndeling({ volgorde: ["voordeur", "aanbod"], verborgen: ["voordeur"], eigen: [] });
    expect(zichtbareSecties(n)).not.toContain("voordeur");
  });
});
