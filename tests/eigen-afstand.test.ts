import { describe, expect, it } from "vitest";
import {
  bepaalOmgeving,
  reisSnelheidKmu,
  schatAlleWijzen,
  schatOpAfstand,
  schatTussenPunten,
  stadBij,
  wegMeters,
} from "@/lib/geo/eigen-afstand";
import { haversineMeters } from "@/lib/geo/geofencing";

// Bekende punten, zodat de getallen na te rekenen zijn met een kaart erbij.
const DAM = { latitude: 52.3731, longitude: 4.8922 };
const AMSTERDAM_ZUID = { latitude: 52.3389, longitude: 4.8731 };
const DOMTOREN = { latitude: 52.0907, longitude: 5.1214 };
const MAASTRICHT = { latitude: 50.8514, longitude: 5.691 };
const POLDER = { latitude: 52.78, longitude: 5.62 }; // Noordoostpolder, geen stad
const BOERDERIJ = { latitude: 52.95, longitude: 5.95 }; // ook buitengebied

describe("hemelsbrede afstanden tussen bekende plaatsen", () => {
  it("Dam tot Domtoren is ongeveer 35 km", () => {
    const m = haversineMeters(DAM, DOMTOREN);
    expect(m).toBeGreaterThan(33_000);
    expect(m).toBeLessThan(37_000);
  });

  it("Dam tot Maastricht is ongeveer 180 km", () => {
    const m = haversineMeters(DAM, MAASTRICHT);
    expect(m).toBeGreaterThan(170_000);
    expect(m).toBeLessThan(190_000);
  });

  it("de weg is altijd langer dan de rechte lijn", () => {
    const recht = haversineMeters(DAM, DOMTOREN);
    expect(wegMeters(recht, "DRIVING")).toBeGreaterThan(recht);
    expect(wegMeters(recht, "WALKING")).toBeGreaterThan(recht);
    // onzin erin geeft geen onzin eruit
    expect(wegMeters(Number.NaN, "DRIVING")).toBe(0);
    expect(wegMeters(-500, "DRIVING")).toBe(0);
  });
});

describe("stad of buitengebied", () => {
  it("kent de grote steden en laat de polder vrij", () => {
    expect(stadBij(DAM)).toBe("Amsterdam");
    expect(stadBij(DOMTOREN)).toBe("Utrecht");
    expect(stadBij(POLDER)).toBeNull();
  });

  it("binnen dezelfde stad is het een stadsrit, tussen twee steden niet", () => {
    expect(bepaalOmgeving(DAM, AMSTERDAM_ZUID)).toBe("stad");
    expect(bepaalOmgeving(DAM, DOMTOREN)).toBe("gemengd");
    expect(bepaalOmgeving(DAM, MAASTRICHT)).toBe("gemengd");
    expect(bepaalOmgeving(DAM, POLDER)).toBe("gemengd");
    expect(bepaalOmgeving(POLDER, BOERDERIJ)).toBe("buitengebied");
  });
});

describe("eigen schatting per vervoerswijze", () => {
  it("Amsterdam naar Utrecht met de auto komt in de buurt van de werkelijkheid", () => {
    const s = schatTussenPunten(DAM, DOMTOREN, "DRIVING");
    expect(s.omgeving).toBe("gemengd");
    expect(s.distanceMeters).toBeGreaterThan(42_000);
    expect(s.distanceMeters).toBeLessThan(52_000);
    expect(s.durationMinutes).toBeGreaterThan(30);
    expect(s.durationMinutes).toBeLessThan(55);
  });

  it("Amsterdam naar Utrecht met het OV duurt langer dan met de auto, maar niet eindeloos", () => {
    const auto = schatTussenPunten(DAM, DOMTOREN, "DRIVING");
    const ov = schatTussenPunten(DAM, DOMTOREN, "TRANSIT");
    expect(ov.durationMinutes).toBeGreaterThan(auto.durationMinutes);
    expect(ov.durationMinutes).toBeLessThan(90);
  });

  it("Amsterdam naar Maastricht gaat over de snelweg, dus niet met stadssnelheid", () => {
    const s = schatTussenPunten(DAM, MAASTRICHT, "DRIVING");
    // ruim 2 tot 3,5 uur; met één vaste snelheid van 42 km/u zou het 5,5 uur worden
    expect(s.durationMinutes).toBeGreaterThan(120);
    expect(s.durationMinutes).toBeLessThan(210);
  });

  it("een ritje binnen de stad: de auto wint nauwelijks van de fiets", () => {
    const auto = schatTussenPunten(DAM, AMSTERDAM_ZUID, "DRIVING");
    const fiets = schatTussenPunten(DAM, AMSTERDAM_ZUID, "BICYCLING");
    expect(auto.omgeving).toBe("stad");
    expect(auto.durationMinutes).toBeLessThan(30);
    expect(Math.abs(auto.durationMinutes - fiets.durationMinutes)).toBeLessThan(15);
  });

  it("lopen is altijd het langzaamst en de auto over afstand het snelst", () => {
    const alle = schatAlleWijzen(DAM, DOMTOREN, ["DRIVING", "TRANSIT", "BICYCLING", "WALKING"]);
    const [auto, ov, fiets, lopen] = alle;
    expect(alle).toHaveLength(4);
    expect(auto?.mode).toBe("DRIVING");
    expect(auto!.durationMinutes).toBeLessThan(ov!.durationMinutes);
    expect(fiets!.durationMinutes).toBeLessThan(lopen!.durationMinutes);
    expect(ov!.durationMinutes).toBeLessThan(fiets!.durationMinutes);
  });

  it("in de stad kost dezelfde afstand met de auto meer tijd dan buiten de stad", () => {
    const stad = schatOpAfstand(8_000, "DRIVING", "stad");
    const buiten = schatOpAfstand(8_000, "DRIVING", "buitengebied");
    expect(stad.durationMinutes).toBeGreaterThan(buiten.durationMinutes);
  });

  it("in het buitengebied is het OV juist slechter dan in de stad", () => {
    const stad = schatOpAfstand(8_000, "TRANSIT", "stad");
    const buiten = schatOpAfstand(8_000, "TRANSIT", "buitengebied");
    expect(buiten.durationMinutes).toBeGreaterThan(stad.durationMinutes);
  });

  it("langer rijden gaat gemiddeld sneller; fietsen houdt dezelfde snelheid", () => {
    expect(reisSnelheidKmu(60, "DRIVING")).toBeGreaterThan(reisSnelheidKmu(3, "DRIVING"));
    expect(reisSnelheidKmu(200, "DRIVING")).toBeLessThan(110);
    expect(reisSnelheidKmu(3, "BICYCLING")).toBeCloseTo(reisSnelheidKmu(30, "BICYCLING"), 6);
  });

  it("dezelfde deur geeft nog steeds minstens één minuut en geen deling door nul", () => {
    const s = schatOpAfstand(0, "DRIVING", "stad");
    expect(s.distanceMeters).toBe(0);
    expect(s.durationMinutes).toBeGreaterThanOrEqual(1);
    expect(Number.isFinite(s.durationMinutes)).toBe(true);
    expect(schatOpAfstand(0, "WALKING").durationMinutes).toBe(1);
  });
});
