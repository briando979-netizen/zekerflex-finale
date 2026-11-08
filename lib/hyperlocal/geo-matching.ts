import { haversineMeters } from "@/lib/geo/geofencing";
import type { GeoPoint } from "@/types/matching";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Geo-Proximity Matching: Location-based service discovery, radius matching,
// local inventory, and geofencing for the hyperlocal marketplace
// ---------------------------------------------------------------------------

export const GeoPointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});

export type GeoPointInput = z.infer<typeof GeoPointSchema>;

export const GeoZoneSchema = z.object({
  id: z.string(),
  name: z.string(),
  centerLat: z.number(),
  centerLon: z.number(),
  radiusMeters: z.number().positive(),
  minDeliveryTime: z.number().int().positive(),
  maxDeliveryTime: z.number().int().positive(),
  serviceFeePercentage: z.number().nonnegative(),
});

export type GeoZone = z.infer<typeof GeoZoneSchema>;

/**
 * Berekent de haversine-afstand in meters tussen twee coördinaten
 */
export function calculateDistance(from: GeoPointInput, to: GeoPointInput): number {
  return haversineMeters(
    { lat: from.lat, lon: from.lon },
    { lat: to.lat, lon: to.lon }
  );
}

/**
 * Controleer of een locatie binnen een geozone valt
 */
export function isWithinZone(
  location: GeoPointInput,
  zone: GeoZone
): boolean {
  const distance = calculateDistance(
    location,
    { lat: zone.centerLat, lon: zone.centerLon }
  );
  return distance <= zone.radiusMeters;
}

/**
 * Vind alle geozones waar een locatie in valt, gesorteerd op afstand
 */
export function findNearestZones(
  location: GeoPointInput,
  zones: GeoZone[],
  limit: number = 3
): Array<GeoZone & { distanceMeters: number }> {
  const zonesWithDistance = zones
    .map((zone) => ({
      ...zone,
      distanceMeters: calculateDistance(
        location,
        { lat: zone.centerLat, lon: zone.centerLon }
      ),
    }))
    .filter((z) => z.distanceMeters <= z.radiusMeters)
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, limit);

  return zonesWithDistance;
}

/**
 * Bereken een servicefactor op basis van afstand en geozonekenmerken
 * Afstand verder weg = hoger tarief
 */
export function calculateProximityFactor(
  distance: number,
  zoneRadiusMeters: number
): number {
  if (distance <= 1000) return 1.0; // 0-1km: standard
  if (distance <= 2000) return 1.1; // 1-2km: +10%
  if (distance <= 5000) return 1.25; // 2-5km: +25%
  if (distance <= zoneRadiusMeters) return 1.4; // edge: +40%
  return 1.6; // outside zone: highest
}

/**
 * Valideer een leveradres en bepaal geozones waar het zich bevindt
 */
export const ValidateDeliveryAddressSchema = z.object({
  address: z.string().min(5),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});

export type ValidateDeliveryAddressInput = z.infer<
  typeof ValidateDeliveryAddressSchema
>;

/**
 * Controleer of een adres bereikbaar is voor hetzelfde-dag levering
 */
export function isReachableForSameDayDelivery(
  distance: number,
  maxDistance: number = 15000 // Default: 15km
): boolean {
  return distance <= maxDistance;
}

/**
 * Schat de bezorgduur op basis van afstand, tijd van dag, en zone-kenmerken
 */
export function estimateDeliveryTime(
  distance: number,
  zone: GeoZone,
  timeOfDay: "morning" | "afternoon" | "evening" = "afternoon"
): number {
  // Basis: ~1 minuut per km
  let baseTime = Math.ceil(distance / 1000);

  // Correctiefactoren per dagdeel (spitsuur vertraging)
  const timeFactors: Record<string, number> = {
    morning: 1.3, // 07:00-09:00 spits
    afternoon: 1.1, // 12:00-13:00 lunch
    evening: 1.0, // Rustig
  };

  baseTime = Math.round(baseTime * (timeFactors[timeOfDay] ?? 1.1));

  // Zet tussen min/max van zone
  baseTime = Math.max(zone.minDeliveryTime, baseTime);
  baseTime = Math.min(zone.maxDeliveryTime, baseTime);

  // Voeg pickuptijd toe (gemiddeld 10 minuten)
  return baseTime + 10;
}

/**
 * Schema voor geozone-creatie door platform admin
 */
export const CreateGeoZoneSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().optional(),
  centerLat: z.number().min(-90).max(90),
  centerLon: z.number().min(-180).max(180),
  radiusMeters: z.number().int().min(500).max(50000), // 500m-50km
  minDeliveryTime: z.number().int().min(15).max(120),
  maxDeliveryTime: z.number().int().min(30).max(300),
  serviceFeePercentage: z.number().min(0).max(50),
  minOrderValue: z.number().int().min(0),
});

export type CreateGeoZoneInput = z.infer<typeof CreateGeoZoneSchema>;

/**
 * Schema voor het zoeken naar geozones
 */
export const SearchGeoZonesSchema = z.object({
  lat: z.number().optional(),
  lon: z.number().optional(),
  radius: z.number().int().optional(),
  limit: z.number().int().default(10).max(100),
});

export type SearchGeoZonesInput = z.infer<typeof SearchGeoZonesSchema>;
