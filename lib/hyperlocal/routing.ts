import { z } from "zod";

// ---------------------------------------------------------------------------
// Last-Mile Routing: AI-powered route optimization, delivery window
// prediction, and driver assignment strategies
// ---------------------------------------------------------------------------

export const RoutePointSchema = z.object({
  id: z.string(),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  name: z.string(),
  deliveryTimeMinutes: z.number().int().optional(),
});

export type RoutePoint = z.infer<typeof RoutePointSchema>;

export const OptimizedRouteSchema = z.object({
  routeId: z.string(),
  partnerId: z.string(),
  stops: z.array(RoutePointSchema),
  totalDistanceMeters: z.number(),
  estimatedDurationMinutes: z.number(),
  sequenceOrder: z.array(z.string()), // Order of delivery IDs
  optimizationScore: z.number().min(0).max(100),
});

export type OptimizedRoute = z.infer<typeof OptimizedRouteSchema>;

export const DeliveryWindowSchema = z.object({
  startTime: z.date(),
  endTime: z.date(),
  confidence: z.number().min(0).max(1),
  factors: z.object({
    distanceMinutes: z.number().int(),
    trafficDelayMinutes: z.number().int(),
    serviceTimeMinutes: z.number().int(),
    weatherDelayMinutes: z.number().int().optional(),
  }),
});

export type DeliveryWindow = z.infer<typeof DeliveryWindowSchema>;

/**
 * Berekent afstanden tussen punten (simplistische versie, in echte situatie
 * gebruik je Haversine of een route-API)
 */
function calculateDistance(p1: RoutePoint, p2: RoutePoint): number {
  const latDiff = p2.lat - p1.lat;
  const lonDiff = p2.lon - p1.lon;
  // Rough approximation: 1 degree ≈ 111 km
  return Math.sqrt(latDiff * latDiff + lonDiff * lonDiff) * 111000;
}

/**
 * Nearest Neighbor heuristiek voor route-optimalisatie
 * Start bij warehouse, bezoek dichtstbijzijnde levering, herhaal
 */
export function nearestNeighborOptimization(
  warehouse: RoutePoint,
  deliveries: RoutePoint[]
): {
  route: RoutePoint[];
  totalDistance: number;
  sequenceOrder: string[];
} {
  const unvisited = [...deliveries];
  const route: RoutePoint[] = [warehouse];
  const sequenceOrder: string[] = [];

  let current = warehouse;
  let totalDistance = 0;

  while (unvisited.length > 0) {
    let nearest: RoutePoint | null = null;
    let nearestIdx = -1;
    let minDistance = Infinity;

    for (let i = 0; i < unvisited.length; i++) {
      const distance = calculateDistance(current, unvisited[i]);
      if (distance < minDistance) {
        minDistance = distance;
        nearest = unvisited[i];
        nearestIdx = i;
      }
    }

    if (nearest) {
      route.push(nearest);
      sequenceOrder.push(nearest.id);
      totalDistance += minDistance;
      current = nearest;
      unvisited.splice(nearestIdx, 1);
    }
  }

  // Return to warehouse
  totalDistance += calculateDistance(current, warehouse);

  return { route, totalDistance, sequenceOrder };
}

/**
 * 2-Opt lokale zoek-verbetering van route
 */
export function improveRouteWith2Opt(
  route: RoutePoint[],
  maxIterations: number = 100
): {
  route: RoutePoint[];
  totalDistance: number;
  sequenceOrder: string[];
} {
  let bestRoute = [...route];
  let bestDistance = calculateRouteTotalDistance(bestRoute);
  let improved = true;
  let iterations = 0;

  while (improved && iterations < maxIterations) {
    improved = false;
    iterations++;

    for (let i = 1; i < bestRoute.length - 2; i++) {
      for (let j = i + 1; j < bestRoute.length; j++) {
        // Try reversing segment
        const newRoute = [
          ...bestRoute.slice(0, i),
          ...bestRoute.slice(i, j).reverse(),
          ...bestRoute.slice(j),
        ];

        const newDistance = calculateRouteTotalDistance(newRoute);

        if (newDistance < bestDistance) {
          bestRoute = newRoute;
          bestDistance = newDistance;
          improved = true;
        }
      }
    }
  }

  return {
    route: bestRoute,
    totalDistance: bestDistance,
    sequenceOrder: bestRoute.slice(1, -1).map((p) => p.id), // Exclude warehouse
  };
}

/**
 * Berekent totale afstand van een route
 */
function calculateRouteTotalDistance(route: RoutePoint[]): number {
  let total = 0;
  for (let i = 0; i < route.length - 1; i++) {
    total += calculateDistance(route[i], route[i + 1]);
  }
  return total;
}

/**
 * Berekent geschatte bezorgduur op basis van route, verkeer, en service-tijd
 */
export function estimateRouteDuration(
  route: RoutePoint[],
  trafficMultiplier: number = 1.1
): {
  travelTimeMinutes: number;
  serviceTimeMinutes: number;
  totalMinutes: number;
} {
  const totalDistance = calculateRouteTotalDistance(route);

  // Gemiddelde snelheid: 30 km/u in stad
  const avgSpeedKmh = 30;
  const travelTimeMinutes =
    (totalDistance / 1000 / avgSpeedKmh) * 60 * trafficMultiplier;

  // Service-tijd per stop (gemiddeld 5 minuten)
  const serviceTimeMinutes = (route.length - 1) * 5;

  return {
    travelTimeMinutes: Math.round(travelTimeMinutes),
    serviceTimeMinutes,
    totalMinutes: Math.round(travelTimeMinutes) + serviceTimeMinutes,
  };
}

/**
 * Voorspel bezorgvenster met betrouwbaarheidsscore
 */
export function predictDeliveryWindow(
  distanceMeters: number,
  currentHour: number,
  weatherCondition: "clear" | "rainy" | "snowy" = "clear"
): DeliveryWindow {
  const now = new Date();

  // Base time: 1 minuut per km + 10 minuten fixed
  let baseMinutes = Math.ceil(distanceMeters / 1000) + 10;

  // Spitsuur correctie
  let trafficFactor = 1.0;
  if ((currentHour >= 7 && currentHour <= 9) || (currentHour >= 17 && currentHour <= 19)) {
    trafficFactor = 1.3; // +30% spitsuur
  }

  let weatherDelayMinutes = 0;
  let confidence = 0.95;

  if (weatherCondition === "rainy") {
    weatherDelayMinutes = Math.ceil(baseMinutes * 0.2); // +20%
    confidence = 0.85;
  } else if (weatherCondition === "snowy") {
    weatherDelayMinutes = Math.ceil(baseMinutes * 0.4); // +40%
    confidence = 0.7;
  }

  const estimatedMinutes = Math.round(baseMinutes * trafficFactor + weatherDelayMinutes);

  const startTime = new Date(now);
  startTime.setMinutes(startTime.getMinutes() + Math.floor(estimatedMinutes * 0.7)); // Begin 70% van schatting

  const endTime = new Date(now);
  endTime.setMinutes(endTime.getMinutes() + Math.ceil(estimatedMinutes * 1.3)); // Einde 130% van schatting

  return {
    startTime,
    endTime,
    confidence,
    factors: {
      distanceMinutes: Math.ceil(distanceMeters / 1000),
      trafficDelayMinutes: Math.round((baseMinutes * trafficFactor - baseMinutes) / 2),
      serviceTimeMinutes: 5,
      weatherDelayMinutes: weatherCondition !== "clear" ? weatherDelayMinutes : undefined,
    },
  };
}

/**
 * Verdeel deliveries over partners op basis van capaciteit en locatie
 */
export function assignDeliveriesToPartners(
  deliveries: RoutePoint[],
  partnerCapacities: Array<{
    partnerId: string;
    currentDeliveries: number;
    maxCapacity: number;
    latitude: number;
    longitude: number;
  }>
): Record<string, string[]> {
  const assignments: Record<string, string[]> = {};

  // Initialize
  for (const partner of partnerCapacities) {
    assignments[partner.partnerId] = [];
  }

  // Sorteer deliveries op lat/lon voor clustering
  const sortedDeliveries = [...deliveries].sort(
    (a, b) => (a.lat + a.lon) - (b.lat + b.lon)
  );

  for (const delivery of sortedDeliveries) {
    // Find beste partner (meest beschikbare, dicht in buurt)
    let bestPartner = null;
    let bestScore = -Infinity;

    for (const partner of partnerCapacities) {
      const availableSlots =
        partner.maxCapacity - partner.currentDeliveries - assignments[partner.partnerId].length;

      if (availableSlots <= 0) continue;

      // Score: beschikbaarheid - afstand
      const distance =
        Math.sqrt(
          Math.pow(delivery.lat - partner.latitude, 2) +
          Math.pow(delivery.lon - partner.longitude, 2)
        ) * 111000; // To meters

      const score = availableSlots - distance / 1000; // Penalty per km

      if (score > bestScore) {
        bestScore = score;
        bestPartner = partner.partnerId;
      }
    }

    if (bestPartner) {
      assignments[bestPartner].push(delivery.id);
    }
  }

  return assignments;
}

/**
 * Schema voor route-optimalisatie verzoek
 */
export const OptimizeRouteRequestSchema = z.object({
  warehouseId: z.string(),
  deliveryIds: z.array(z.string()).min(1),
  optimizationMethod: z.enum(["nearest_neighbor", "genetic", "simulated_annealing"]).default("nearest_neighbor"),
  considerTraffic: z.boolean().default(true),
});

export type OptimizeRouteRequest = z.infer<typeof OptimizeRouteRequestSchema>;
