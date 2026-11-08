import { prisma } from "@/lib/prisma";
import { estimateTravel, fastestMode } from "@/lib/geo/travel-time";
import type { GeoPoint, TravelEstimate } from "@/types/matching";

/**
 * Location matching result with distance and travel time.
 */
export interface LocationMatchResult {
  freelancerId: string;
  shiftLocationId: string;
  distance: number; // meters
  travelEstimate: TravelEstimate;
  score: number; // [0, 1] - higher is better
  withinCommuteBound: boolean;
}

/**
 * Calculate Haversine distance between two geographic points.
 * Returns distance in meters.
 */
export function haversineDistance(point1: GeoPoint, point2: GeoPoint): number {
  const EARTH_RADIUS_M = 6371000;
  const lat1Rad = (point1.latitude * Math.PI) / 180;
  const lat2Rad = (point2.latitude * Math.PI) / 180;
  const deltaLatRad = ((point2.latitude - point1.latitude) * Math.PI) / 180;
  const deltaLonRad = ((point2.longitude - point1.longitude) * Math.PI) / 180;

  const a = Math.sin(deltaLatRad / 2) ** 2 + Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(deltaLonRad / 2) ** 2;
  const c = 2 * Math.asin(Math.sqrt(a));

  return EARTH_RADIUS_M * c;
}

/**
 * Estimate commute time penalty. Linear decay with max commute bound.
 * Returns [0, 1] where 1 is ideal (very close).
 */
function scoreCommute(travelMinutes: number, maxTravelMinutes: number): number {
  if (travelMinutes > maxTravelMinutes) {
    return 0;
  }

  // Linear decay from 1 (zero travel) to 0 (at max bound)
  return 1 - travelMinutes / maxTravelMinutes;
}

/**
 * Check if freelancer location is within a geofence of the shift.
 * Used for location-based notifications and matching gating.
 */
export function isWithinGeofence(
  freelancerLocation: GeoPoint,
  shiftLocation: GeoPoint,
  radiusMeters: number,
): boolean {
  const distance = haversineDistance(freelancerLocation, shiftLocation);
  return distance <= radiusMeters;
}

/**
 * Match a freelancer to a shift based on location/commute.
 */
export async function matchLocationForFreelancer(
  freelancerId: string,
  shiftLocationId: string,
  maxTravelMinutes: number,
  shiftStartTime: Date,
): Promise<LocationMatchResult | null> {
  const [freelancer, shiftLocation] = await Promise.all([
    prisma.freelancerProfile.findUnique({
      where: { id: freelancerId },
      select: {
        homeLatitude: true,
        homeLongitude: true,
      },
    }),
    prisma.branch.findUnique({
      where: { id: shiftLocationId },
      select: {
        latitude: true,
        longitude: true,
      },
    }),
  ]);

  if (!freelancer || !shiftLocation || freelancer.homeLatitude == null || freelancer.homeLongitude == null) {
    return null;
  }

  const freelancerLocation: GeoPoint = {
    latitude: freelancer.homeLatitude,
    longitude: freelancer.homeLongitude,
  };

  const shiftLocation_: GeoPoint = {
    latitude: shiftLocation.latitude,
    longitude: shiftLocation.longitude,
  };

  const distance = haversineDistance(freelancerLocation, shiftLocation_);

  // Estimate travel time
  const travelEstimates = await estimateTravel(
    freelancerLocation,
    shiftLocation_,
    ["DRIVING", "TRANSIT", "BICYCLING"],
    shiftStartTime,
  );

  const travel = fastestMode(travelEstimates);
  const withinCommuteBound = travel.durationMinutes <= maxTravelMinutes;
  const score = scoreCommute(travel.durationMinutes, maxTravelMinutes);

  return {
    freelancerId,
    shiftLocationId,
    distance,
    travelEstimate: travel,
    score: Math.max(0, Math.min(1, score)),
    withinCommuteBound,
  };
}

/**
 * Batch match multiple freelancers to a shift location.
 */
export async function batchMatchLocation(
  freelancerIds: string[],
  shiftLocationId: string,
  maxTravelMinutes: number,
  shiftStartTime: Date,
): Promise<LocationMatchResult[]> {
  const results = await Promise.all(
    freelancerIds.map((fid) => matchLocationForFreelancer(fid, shiftLocationId, maxTravelMinutes, shiftStartTime)),
  );

  return results.filter((r): r is LocationMatchResult => r !== null).sort((a, b) => b.score - a.score);
}

/**
 * Find the nearest freelancers to a shift location.
 * Useful for routing optimization and backup matching.
 */
export async function findNearestFreelancers(
  shiftLocationId: string,
  maxDistanceMeters: number = 50000,
  limit: number = 20,
): Promise<
  Array<{
    freelancerId: string;
    distance: number;
    homeLocation: GeoPoint;
  }>
> {
  const shiftLocation = await prisma.branch.findUnique({
    where: { id: shiftLocationId },
    select: { latitude: true, longitude: true },
  });

  if (!shiftLocation) {
    return [];
  }

  const freelancers = await prisma.freelancerProfile.findMany({
    where: {
      homeLatitude: { not: null },
      homeLongitude: { not: null },
    },
    select: {
      id: true,
      homeLatitude: true,
      homeLongitude: true,
    },
    take: 1000, // Limit population to avoid massive computation
  });

  const shiftGeo: GeoPoint = {
    latitude: shiftLocation.latitude,
    longitude: shiftLocation.longitude,
  };

  const withDistances = freelancers
    .map((f) => ({
      freelancerId: f.id,
      distance: haversineDistance(
        { latitude: f.homeLatitude ?? 0, longitude: f.homeLongitude ?? 0 },
        shiftGeo,
      ),
      homeLocation: {
        latitude: f.homeLatitude ?? 0,
        longitude: f.homeLongitude ?? 0,
      },
    }))
    .filter((f) => f.distance <= maxDistanceMeters)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);

  return withDistances;
}

/**
 * Calculate optimal route for pickup/delivery.
 * Using greedy nearest-neighbor for simplicity (TSP approximation).
 */
export async function optimizeDeliveryRoute(
  startLocation: GeoPoint,
  locations: Array<{ id: string; location: GeoPoint }>,
): Promise<
  Array<{
    locationId: string;
    distance: number;
    cumulativeDistance: number;
  }>
> {
  const route: Array<{
    locationId: string;
    distance: number;
    cumulativeDistance: number;
  }> = [];

  let current = startLocation;
  let remaining = [...locations];
  let totalDistance = 0;

  while (remaining.length > 0) {
    // Find nearest unvisited location
    let nearest: typeof remaining[0] | undefined;
    let nearestDistance = Infinity;

    for (const loc of remaining) {
      const dist = haversineDistance(current, loc.location);
      if (dist < nearestDistance) {
        nearestDistance = dist;
        nearest = loc;
      }
    }

    if (!nearest) break;

    totalDistance += nearestDistance;
    route.push({
      locationId: nearest.id,
      distance: nearestDistance,
      cumulativeDistance: totalDistance,
    });

    remaining = remaining.filter((l) => l.id !== nearest!.id);
    current = nearest.location;
  }

  return route;
}

/**
 * Calculate service area coverage based on freelancer distribution.
 * Returns percentage of locations covered within maxTravelMinutes.
 */
export async function calculateServiceAreaCoverage(
  branchLocationId: string,
  maxTravelMinutes: number,
): Promise<{
  coveredFreelancers: number;
  totalFreelancers: number;
  coveragePercentage: number;
}> {
  const shiftLocation = await prisma.branch.findUnique({
    where: { id: branchLocationId },
    select: { latitude: true, longitude: true },
  });

  if (!shiftLocation) {
    return {
      coveredFreelancers: 0,
      totalFreelancers: 0,
      coveragePercentage: 0,
    };
  }

  const freelancers = await prisma.freelancerProfile.findMany({
    where: {
      homeLatitude: { not: null },
      homeLongitude: { not: null },
    },
    select: { id: true, homeLatitude: true, homeLongitude: true },
  });

  const shiftGeo: GeoPoint = {
    latitude: shiftLocation.latitude,
    longitude: shiftLocation.longitude,
  };

  let coveredCount = 0;

  for (const freelancer of freelancers) {
    const travelEstimates = await estimateTravel(
      {
        latitude: freelancer.homeLatitude ?? 0,
        longitude: freelancer.homeLongitude ?? 0,
      },
      shiftGeo,
      ["DRIVING", "TRANSIT"],
      new Date(),
    );

    const travel = fastestMode(travelEstimates);
    if (travel.durationMinutes <= maxTravelMinutes) {
      coveredCount += 1;
    }
  }

  return {
    coveredFreelancers: coveredCount,
    totalFreelancers: freelancers.length,
    coveragePercentage: freelancers.length > 0 ? (coveredCount / freelancers.length) * 100 : 0,
  };
}
