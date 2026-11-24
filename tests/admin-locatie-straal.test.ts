import { describe, expect, it } from "vitest";
import { afstandKm, binnenStraal, lijktOpPostcode } from "@/lib/admin/locatie-straal";

const groningen = { lat: 53.2194, lon: 6.5665 };
const utrecht = { lat: 52.0902, lon: 5.1211 };

describe("locatie-straal", () => {
  it("rekent een afstand in kilometers uit", () => {
    expect(afstandKm(groningen, groningen)).toBe(0);
    const km = afstandKm(groningen, utrecht);
    expect(km).toBeGreaterThan(150);
    expect(km).toBeLessThan(165);
  });

  it("ziet een werker binnen de straal, en een werker zonder coördinaten nooit", () => {
    const dichtbij = { lat: 53.2169, lon: 6.5766 };
    expect(binnenStraal(groningen, 5, dichtbij)).toBe(true);
    expect(binnenStraal(groningen, 5, utrecht)).toBe(false);
    expect(binnenStraal(groningen, 50, undefined)).toBe(false);
  });

  it("herkent een postcode in de invoer", () => {
    expect(lijktOpPostcode("9711")).toBe(true);
    expect(lijktOpPostcode("9711 TN")).toBe(true);
    expect(lijktOpPostcode("9711tn")).toBe(true);
    expect(lijktOpPostcode("Groningen")).toBe(false);
    expect(lijktOpPostcode("Dam 1 Amsterdam")).toBe(false);
  });
});
