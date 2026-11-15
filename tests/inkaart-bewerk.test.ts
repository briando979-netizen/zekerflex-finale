import { describe, expect, it } from "vitest";
import { getalOfNull, kopieerBezettingNaarAlle, nieuweGroep, nieuweRuimte, procentOfNull, vulOpenDagdelen, volgendeId, zetBezetting, zetOpen } from "@/lib/inkaart/bewerk";
import { RASTER_LENGTE, SOORTEN, leegBedrijf, type BedrijfInKaart } from "@/lib/inkaart/model";
import { VOORBEELDEN, bedrijfMetVoorbeeld, voorbeeldRegels } from "@/lib/inkaart/sjablonen";
import { leesBedrijf } from "@/lib/inkaart/schema";

// Het bewerken op het scherm en de voorbeeldsets van "Bedrijf in kaart": zuivere hulpjes, dus zonder scherm te testen.

const NU = new Date("2026-11-15T10:00:00+01:00");
function metRuimtes(): BedrijfInKaart {
  const b = leegBedrijf("praktijk", NU);
  return { ...b, ruimtes: [nieuweRuimte([]), { ...nieuweRuimte([{ id: "r1" }]), naam: "Behandelkamer" }] };
}

describe("getallen uit invoervelden", () => {
  it("leest een komma als decimaalteken en laat onzin en leeg als null", () => {
    expect(getalOfNull("12,5")).toBe(12.5);
    expect(getalOfNull(" 1 250 ")).toBe(1250);
    expect(getalOfNull("")).toBeNull();
    expect(getalOfNull("abc")).toBeNull();
    expect(getalOfNull("12,")).toBe(12);
  });

  it("houdt een percentage binnen 0 tot 100", () => {
    expect(procentOfNull("55")).toBe(55);
    expect(procentOfNull("140")).toBe(100);
    expect(procentOfNull("-4")).toBe(0);
    expect(procentOfNull("")).toBeNull();
    expect(procentOfNull("x")).toBeNull();
  });
});

describe("regels toevoegen", () => {
  it("een nieuwe regel krijgt een id dat nog niet bestaat, ook na een verwijdering", () => {
    expect(volgendeId("r", [])).toBe("r1");
    expect(volgendeId("r", [{ id: "r1" }, { id: "r2" }])).toBe("r3");
    expect(volgendeId("r", [{ id: "r1" }, { id: "r3" }])).toBe("r2");
    expect(nieuweGroep([{ id: "g1" }]).id).toBe("g2");
  });

  it("een nieuwe ruimte is geldig volgens de controle", () => {
    const b = { ...leegBedrijf("overig", NU), ruimtes: [nieuweRuimte([])] };
    expect(leesBedrijf(b)).not.toBeNull();
  });
});

describe("de bezetting invullen", () => {
  it("zet één dagdeel van één ruimte en laat de rest en de andere ruimtes met rust", () => {
    const b = metRuimtes();
    const n = zetBezetting(b, "r1", 4, 70);
    expect(n.ruimtes[0]?.bezetting[4]).toBe(70);
    expect(n.ruimtes[0]?.bezetting.filter((x) => x !== null)).toHaveLength(1);
    expect(n.ruimtes[1]?.bezetting.every((x) => x === null)).toBe(true);
    // het oorspronkelijke object blijft ongemoeid
    expect(b.ruimtes[0]?.bezetting[4]).toBeNull();
  });

  it("een index buiten het raster verandert niets", () => {
    const b = metRuimtes();
    expect(zetBezetting(b, "r1", RASTER_LENGTE, 50)).toBe(b);
    expect(zetBezetting(b, "r1", -1, 50)).toBe(b);
    expect(zetBezetting(b, "r1", 1.5, 50)).toBe(b);
  });

  it("vult alleen de open dagdelen en houdt de percentages binnen 0 tot 100", () => {
    const b = metRuimtes();
    const n = vulOpenDagdelen(b, "r1", 60);
    const r = n.ruimtes[0]!.bezetting;
    expect(r.filter((x) => x === 60)).toHaveLength(b.open.filter(Boolean).length); // standaard: 10 open dagdelen
    expect(r.filter((x) => x === null)).toHaveLength(RASTER_LENGTE - 10);
    expect(vulOpenDagdelen(b, "r1", 250).ruimtes[0]?.bezetting.find((x) => x !== null)).toBe(100);
    expect(vulOpenDagdelen(b, "r1", -9).ruimtes[0]?.bezetting.find((x) => x !== null)).toBe(0);
  });

  it("kopieert het raster naar alle ruimtes, elk met een eigen kopie", () => {
    const b = vulOpenDagdelen(metRuimtes(), "r1", 40);
    const n = kopieerBezettingNaarAlle(b, "r1");
    expect(n.ruimtes[1]?.bezetting).toEqual(n.ruimtes[0]?.bezetting);
    expect(n.ruimtes[1]?.bezetting).not.toBe(n.ruimtes[0]?.bezetting);
    expect(kopieerBezettingNaarAlle(b, "bestaat-niet")).toBe(b);
  });

  it("een dagdeel open of dicht zetten", () => {
    const b = leegBedrijf("overig", NU);
    expect(b.open[2]).toBe(false); // maandagavond: standaard dicht
    expect(zetOpen(b, 2, true).open[2]).toBe(true);
    expect(zetOpen(b, 99, true)).toBe(b);
  });
});

describe("de voorbeeldsets", () => {
  it("elke soort bedrijf heeft een set, en elke set levert een geldig bedrijf", () => {
    for (const soort of SOORTEN) {
      expect(VOORBEELDEN[soort].naam, soort).toBeTruthy();
      expect(leesBedrijf(bedrijfMetVoorbeeld(soort, NU)), soort).not.toBeNull();
    }
  });

  it("vult alleen namen en soorten in: nooit aantallen, oppervlakte, bezetting of kosten (die zijn van het bedrijf zelf)", () => {
    for (const soort of SOORTEN) {
      const r = voorbeeldRegels(soort);
      for (const ruimte of r.ruimtes) {
        expect(ruimte.aantal, `${soort} ${ruimte.naam}`).toBe(1);
        expect(ruimte.m2).toBeNull();
        expect(ruimte.plekken).toBeNull();
        expect(ruimte.bezetting.every((x) => x === null)).toBe(true);
      }
      for (const groep of r.groepen) {
        expect(groep.fte).toBe(0);
        expect(groep.kostenJaar).toBeNull();
      }
    }
  });

  it("het ziekenhuis heeft spreekkamers en is altijd open; 'anders' begint leeg", () => {
    expect(voorbeeldRegels("ziekenhuis").ruimtes.map((r) => r.naam)).toContain("Spreekkamer");
    expect(voorbeeldRegels("ziekenhuis").open.every(Boolean)).toBe(true);
    expect(voorbeeldRegels("overig")).toEqual({ groepen: [], ruimtes: [], open: leegBedrijf().open });
    // de horeca is middag en avond open, elke dag
    const horeca = voorbeeldRegels("horeca").open;
    expect(horeca[0]).toBe(false); // maandagochtend
    expect(horeca[1]).toBe(true);
    expect(horeca[2]).toBe(true);
  });

  it("de id's in een set zijn uniek", () => {
    for (const soort of SOORTEN) {
      const r = voorbeeldRegels(soort);
      expect(new Set(r.ruimtes.map((x) => x.id)).size).toBe(r.ruimtes.length);
      expect(new Set(r.groepen.map((x) => x.id)).size).toBe(r.groepen.length);
    }
  });
});
