import { describe, expect, it } from "vitest";
import { decodePolyline, encodePolyline } from "@/lib/geo/polyline";
import {
  binnenRouteGebied,
  leesRouteVraag,
  leesValhallaRoute,
  routeSleutel,
  valhallaVerzoek,
} from "@/lib/geo/route-core";

const DAM = { lat: 52.3731, lon: 4.8936 };
const DOM = { lat: 52.0907, lon: 5.1214 };

describe("encoded polyline", () => {
  it("leest het voorbeeld van Google (5 cijfers precisie), als [lon, lat]", () => {
    const punten = decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@", 5);
    expect(punten).toEqual([
      [-120.2, 38.5],
      [-120.95, 40.7],
      [-126.453, 43.252],
    ]);
  });

  it("heen en terug met 6 cijfers (zoals Valhalla) geeft dezelfde punten", () => {
    const lijn: [number, number][] = [
      [4.893612, 52.373118],
      [4.9, 52.37],
      [5.121403, 52.090694],
      [-0.000001, 0.000001],
    ];
    expect(decodePolyline(encodePolyline(lijn, 6), 6)).toEqual(lijn);
  });

  it("een afgebroken of kapotte tekst geeft de punten tot daar, nooit een fout", () => {
    const heel = encodePolyline([
      [4.9, 52.37],
      [5.12, 52.09],
    ]);
    const half = decodePolyline(heel.slice(0, heel.length - 2));
    expect(half).toEqual([[4.9, 52.37]]);
    expect(decodePolyline("")).toEqual([]);
    expect(decodePolyline("\u0001\u0002")).toEqual([]);
  });
});

describe("de vraag aan Valhalla", () => {
  it("vraagt Nederlands, kilometers en de juiste vervoerswijze", () => {
    expect(valhallaVerzoek(DAM, DOM, "fiets", true)).toEqual({
      locations: [
        { lat: DAM.lat, lon: DAM.lon },
        { lat: DOM.lat, lon: DOM.lon },
      ],
      costing: "bicycle",
      units: "kilometers",
      language: "nl-NL",
      directions_type: "instructions",
    });
    expect(valhallaVerzoek(DAM, DOM, "auto", false)).toMatchObject({ costing: "auto", directions_type: "none" });
    expect(valhallaVerzoek(DAM, DOM, "lopen", true)).toMatchObject({ costing: "pedestrian" });
  });

  it("de cachesleutel onderscheidt vervoer en afslagen, en rondt af op ±1 m", () => {
    expect(routeSleutel(DAM, DOM, "auto", true)).not.toBe(routeSleutel(DAM, DOM, "fiets", true));
    expect(routeSleutel(DAM, DOM, "auto", true)).not.toBe(routeSleutel(DAM, DOM, "auto", false));
    expect(routeSleutel({ lat: 52.3731001, lon: 4.8936001 }, DOM, "auto", true)).toBe(routeSleutel(DAM, DOM, "auto", true));
  });
});

describe("het antwoord van Valhalla", () => {
  const shape = encodePolyline([
    [4.8936, 52.3731],
    [4.95, 52.3],
    [5.1214, 52.0907],
  ]);

  it("geeft meters, seconden, de lijn en de afslagen", () => {
    const route = leesValhallaRoute({
      trip: {
        summary: { length: 44.123, time: 2_461.8 },
        legs: [
          {
            shape,
            maneuvers: [
              { instruction: "Rijd naar het zuiden op de Damrak.", length: 0.42, time: 61.2 },
              { instruction: "  ", length: 1, time: 1 },
              { instruction: "Je bent aangekomen op je bestemming.", length: 0, time: 0 },
            ],
          },
        ],
      },
    });
    expect(route).toEqual({
      meters: 44_123,
      seconds: 2_462,
      lijn: [
        [4.8936, 52.3731],
        [4.95, 52.3],
        [5.1214, 52.0907],
      ],
      stappen: [
        { tekst: "Rijd naar het zuiden op de Damrak.", meters: 420, seconds: 61 },
        { tekst: "Je bent aangekomen op je bestemming.", meters: 0, seconds: 0 },
      ],
    });
  });

  it("plakt benen aan elkaar zonder het gedeelde punt dubbel", () => {
    const tweede = encodePolyline([
      [5.1214, 52.0907],
      [5.2, 52.0],
    ]);
    const route = leesValhallaRoute({ trip: { summary: { length: 50, time: 3000 }, legs: [{ shape }, { shape: tweede }] } });
    expect(route?.lijn).toHaveLength(4);
  });

  it("zonder totale lengte of tijd, of met rommel, is er geen route", () => {
    expect(leesValhallaRoute(null)).toBeNull();
    expect(leesValhallaRoute({})).toBeNull();
    expect(leesValhallaRoute({ trip: { summary: { length: "x", time: 10 } } })).toBeNull();
    expect(leesValhallaRoute({ error_code: 442, error: "No path could be found for input" })).toBeNull();
  });

  it("leest soepel: een getal als tekst telt, een been zonder lijn wordt overgeslagen", () => {
    const route = leesValhallaRoute({ trip: { summary: { length: "1.5", time: "120" }, legs: [{ maneuvers: "geen lijst" }, 7] } });
    expect(route).toEqual({ meters: 1500, seconds: 120, lijn: [], stappen: [] });
  });
});

describe("de vraag van de kaart controleren", () => {
  it("een goede vraag gaat door, auto als je niets kiest", () => {
    expect(leesRouteVraag({ van: DAM, naar: DOM })).toEqual({ ok: true, van: DAM, naar: DOM, modus: "auto" });
    expect(leesRouteVraag({ van: DAM, naar: DOM, modus: "fiets" })).toMatchObject({ ok: true, modus: "fiets" });
  });

  it("weigert ontbrekende of kapotte punten", () => {
    for (const body of [null, "tekst", [], {}, { van: DAM }, { van: DAM, naar: { lat: "52", lon: 5 } }, { van: DAM, naar: { lat: NaN, lon: 5 } }]) {
      const r = leesRouteVraag(body);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.fout).toMatch(/vertrekpunt en een bestemming/);
    }
  });

  it("alleen binnen Nederland", () => {
    const parijs = { lat: 48.8566, lon: 2.3522 };
    const r = leesRouteVraag({ van: DAM, naar: parijs });
    expect(r).toEqual({ ok: false, fout: "De routeplanner werkt alleen binnen Nederland." });
    expect(binnenRouteGebied(DAM)).toBe(true);
    expect(binnenRouteGebied({ lat: 52, lon: 8.5 })).toBe(false);
  });

  it("weigert een onbekende vervoerswijze, dezelfde plek en heel ver lopen", () => {
    expect(leesRouteVraag({ van: DAM, naar: DOM, modus: "vliegen" })).toEqual({ ok: false, fout: "Kies auto, fiets of lopen." });
    expect(leesRouteVraag({ van: DAM, naar: DAM }).ok).toBe(false);
    const groningen = { lat: 53.2194, lon: 6.5665 };
    const r = leesRouteVraag({ van: DAM, naar: groningen, modus: "lopen" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fout).toMatch(/fiets of de auto/);
    expect(leesRouteVraag({ van: DAM, naar: groningen, modus: "fiets" }).ok).toBe(true);
  });
});
