import { describe, expect, it } from "vitest";
import {
  calculateDistanceMeters,
  evaluateGeofence,
  haversineMeters,
  validateCheckIn,
} from "@/lib/geo/geofencing";

// Amsterdam Centrum branch (from the seed).
const SITE = { lat: 52.3702, lon: 4.8952 };

describe("calculateDistanceMeters", () => {
  it("is ~0 for identical points", () => {
    expect(calculateDistanceMeters(SITE.lat, SITE.lon, SITE.lat, SITE.lon)).toBeLessThan(0.01);
  });

  it("matches a known distance (Amsterdam ↔ Utrecht ≈ 35 km)", () => {
    const d = calculateDistanceMeters(52.3702, 4.8952, 52.0894, 5.1101);
    expect(d).toBeGreaterThan(33_000);
    expect(d).toBeLessThan(38_000);
  });

  it("agrees with the GeoPoint haversine", () => {
    const a = calculateDistanceMeters(52.37, 4.89, 52.09, 5.11);
    const b = haversineMeters(
      { latitude: 52.37, longitude: 4.89 },
      { latitude: 52.09, longitude: 5.11 },
    );
    expect(Math.abs(a - b)).toBeLessThan(0.01);
  });
});

describe("validateCheckIn", () => {
  it("accepts a position inside the default 100 m radius", () => {
    // ~30 m north of the site.
    const r = validateCheckIn(52.37047, 4.8952, SITE.lat, SITE.lon);
    expect(r.isValid).toBe(true);
    expect(r.distanceMeters).toBeLessThan(100);
  });

  it("rejects a position well outside the radius", () => {
    const r = validateCheckIn(52.3800, 4.9100, SITE.lat, SITE.lon);
    expect(r.isValid).toBe(false);
    expect(r.distanceMeters).toBeGreaterThan(100);
  });

  it("honours a custom radius", () => {
    const r = validateCheckIn(52.3720, 4.8952, SITE.lat, SITE.lon, 250);
    expect(r.distanceMeters).toBeGreaterThan(150);
    expect(r.isValid).toBe(true);
  });
});

describe("evaluateGeofence", () => {
  it("widens the fence by the GPS accuracy", () => {
    const point = { latitude: 52.3715, longitude: 4.8952 }; // ~145 m out
    const center = { latitude: SITE.lat, longitude: SITE.lon };
    expect(evaluateGeofence(point, center, 100, 0).withinGeofence).toBe(false);
    expect(evaluateGeofence(point, center, 100, 80).withinGeofence).toBe(true);
  });
});
