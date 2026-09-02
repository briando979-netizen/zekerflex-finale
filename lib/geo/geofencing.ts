import type { GeoPoint } from "@/types/matching";

const EARTH_RADIUS_M = 6_371_008.8;

const toRad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Great-circle distance in meters between two WGS84 points (haversine).
 * Accurate to well within GPS error over the distances relevant here.
 */
export function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h =
    sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface GeofenceCheck {
  distanceMeters: number;
  withinGeofence: boolean;
  /** Distance beyond the fence (0 when inside), useful for tolerance bands. */
  overshootMeters: number;
}

/**
 * Evaluate a location against a circular branch geofence. `accuracyMeters` from
 * the device is added as tolerance so a legitimate check-in at the edge of the
 * fence with a weak GPS fix is not rejected.
 */
export function evaluateGeofence(
  point: GeoPoint,
  center: GeoPoint,
  radiusMeters: number,
  accuracyMeters = 0,
): GeofenceCheck {
  const distanceMeters = haversineMeters(point, center);
  const effectiveRadius = radiusMeters + Math.min(accuracyMeters, radiusMeters);
  const withinGeofence = distanceMeters <= effectiveRadius;
  return {
    distanceMeters: Math.round(distanceMeters),
    withinGeofence,
    overshootMeters: withinGeofence
      ? 0
      : Math.round(distanceMeters - effectiveRadius),
  };
}

/**
 * Great-circle distance in meters between two lat/lon pairs. Thin numeric-arg
 * wrapper around {@link haversineMeters} for use directly in API routes.
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  return haversineMeters(
    { latitude: lat1, longitude: lon1 },
    { latitude: lat2, longitude: lon2 },
  );
}

export interface CheckInValidation {
  isValid: boolean;
  distanceMeters: number;
}

/**
 * Validate a worker's GPS position against a work-site location. Mirrors
 * {@link evaluateGeofence} but with the simple numeric signature the mobile
 * check-in / dispute-console callers use. `maxAllowedMeters` is the site's
 * geofence radius (default 100 m).
 */
export function validateCheckIn(
  workerLat: number,
  workerLon: number,
  siteLat: number,
  siteLon: number,
  maxAllowedMeters = 100,
): CheckInValidation {
  const distance = calculateDistanceMeters(workerLat, workerLon, siteLat, siteLon);
  return {
    isValid: distance <= maxAllowedMeters,
    distanceMeters: Math.round(distance),
  };
}
