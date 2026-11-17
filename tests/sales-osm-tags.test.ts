import { describe, expect, it } from "vitest";
import { OSM_TAGS_PER_SECTOR, STRAAL_M, middelpuntVanStad, sectorVan, tagsVoorSector } from "@/lib/sales/discovery/osm-tags";
import { CITIES } from "@/lib/seo-cities";

// 17 nov 2026: de salesmotor zoekt bedrijven eerst op OSM-kenmerken rond het middelpunt van de plaats (Overpass);
// Nominatim op vrije tekst ("schoonmaak Veendam") vond bijna niets. Dit is de koppeling sector → kenmerken.

describe("osm-tags: sector → kenmerken", () => {
  it("elke standaardsector van de motor heeft kenmerken", () => {
    for (const s of ["horeca", "logistiek", "retail", "schoonmaak", "evenementen", "zorg", "bouw"]) {
      expect(tagsVoorSector(s).length, s).toBeGreaterThan(0);
    }
  });

  it("de namen zijn zoals OSM ze schrijft: kleine letters, underscore, geen vreemde tekens", () => {
    for (const [sector, tags] of Object.entries(OSM_TAGS_PER_SECTOR)) {
      expect(sector).toMatch(/^[a-z]+$/);
      for (const t of tags) {
        expect(t.sleutel).toMatch(/^[a-z][a-z_:]{1,39}$/);
        for (const soort of t.soorten ?? []) expect(soort, `${sector} ${t.sleutel}`).toMatch(/^[a-z0-9][a-z0-9_:.-]{1,59}$/);
        if (t.soorten) expect(t.soorten.length).toBeGreaterThan(0);
      }
    }
  });

  it("sectornamen uit een campagne worden herkend, ook met woorden eromheen; onbekend blijft onbekend", () => {
    expect(sectorVan("horeca")).toBe("horeca");
    expect(sectorVan("Horeca ")).toBe("horeca");
    expect(sectorVan("haven en logistiek")).toBe("logistiek");
    expect(sectorVan("logistiek en distributie")).toBe("logistiek");
    expect(sectorVan("productie en techniek")).toBe("productie");
    expect(sectorVan("hotels")).toBe("horeca");
    expect(sectorVan("detailhandel")).toBe("retail");
    expect(sectorVan("kinderopvang")).toBeNull();
    expect(sectorVan("")).toBeNull();
    expect(tagsVoorSector("kinderopvang")).toEqual([]);
  });

  it("horeca is meer dan restaurants, retail is elke winkel (shop=*)", () => {
    const horeca = tagsVoorSector("horeca").flatMap((t) => (t.soorten ?? []).map((s) => `${t.sleutel}=${s}`));
    expect(horeca).toContain("amenity=restaurant");
    expect(horeca).toContain("amenity=cafe");
    expect(horeca).toContain("tourism=hotel");
    expect(tagsVoorSector("retail")).toEqual([{ sleutel: "shop" }]);
  });

  it("het middelpunt van een stad met een eigen pagina, op naam of slug; onbekend is null", () => {
    expect(middelpuntVanStad("Groningen")).toEqual({ lat: 53.2194, lng: 6.5665 });
    expect(middelpuntVanStad("groningen")).toEqual({ lat: 53.2194, lng: 6.5665 });
    expect(middelpuntVanStad("den-haag")).toEqual(middelpuntVanStad("Den Haag"));
    expect(middelpuntVanStad("Atlantis")).toBeNull();
    expect(middelpuntVanStad("")).toBeNull();
    for (const c of CITIES) expect(middelpuntVanStad(c.name), c.name).not.toBeNull();
    // 5 km: een stadskern, niet een hele provincie (Overpass staat tot 20 km toe)
    expect(STRAAL_M).toBe(5000);
  });
});
