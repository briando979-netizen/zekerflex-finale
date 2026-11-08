import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import * as geoMatching from "@/lib/hyperlocal/geo-matching";
import * as fulfillment from "@/lib/hyperlocal/fulfillment";
import * as routing from "@/lib/hyperlocal/routing";
import * as partners from "@/lib/hyperlocal/partners";
import * as ux from "@/lib/hyperlocal/ux";
import * as analytics from "@/lib/hyperlocal/analytics";

// ---------------------------------------------------------------------------
// API Routes for Hyperlocal Marketplace System
// Endpoints for managing geo-zones, deliveries, partners, and analytics
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ActionSchema = z.object({
  action: z.enum([
    "createGeoZone",
    "searchGeoZones",
    "createWarehouse",
    "getInventory",
    "optimizeRoute",
    "findPartners",
    "createDelivery",
    "trackDelivery",
    "submitFeedback",
    "getAnalytics",
    "forecastDemand",
    "competitiveAnalysis",
    "expansionRecommendations",
  ]),
  data: z.record(z.any()),
});

/**
 * POST /api/hyperlocal - Main hyperlocal marketplace endpoint
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { action, data } = ActionSchema.parse(body);

    switch (action) {
      case "createGeoZone": {
        const validated = geoMatching.CreateGeoZoneSchema.parse(data);
        const zone = await prisma.geoZone.create({
          data: {
            tenantId: data.tenantId,
            name: validated.name,
            description: validated.description,
            status: "ACTIVE",
            centerLat: validated.centerLat,
            centerLon: validated.centerLon,
            radiusMeters: validated.radiusMeters,
            minDeliveryTime: validated.minDeliveryTime,
            maxDeliveryTime: validated.maxDeliveryTime,
            serviceFeePercentage: validated.serviceFeePercentage,
            minOrderValue: validated.minOrderValue,
          },
        });
        return NextResponse.json({ success: true, data: zone });
      }

      case "searchGeoZones": {
        const validated = geoMatching.SearchGeoZonesSchema.parse(data);
        const zones = await prisma.geoZone.findMany({
          where: {
            status: "ACTIVE",
          },
          take: validated.limit,
        });

        if (validated.lat && validated.lon) {
          const location = { lat: validated.lat, lon: validated.lon };
          const nearest = geoMatching.findNearestZones(zones, location, 3);
          return NextResponse.json({ success: true, data: nearest });
        }

        return NextResponse.json({ success: true, data: zones });
      }

      case "createWarehouse": {
        const validated = fulfillment.CreateMicroWarehouseSchema.parse(data);
        const warehouse = await prisma.microWarehouse.create({
          data: {
            tenantId: validated.tenantId,
            geoZoneId: validated.geoZoneId,
            name: validated.name,
            address: validated.address,
            latitude: validated.latitude,
            longitude: validated.longitude,
            totalCapacity: validated.totalCapacity,
            status: "ACTIVE",
            operatingHoursOpen: validated.operatingHoursOpen,
            operatingHoursClose: validated.operatingHoursClose,
          },
        });
        return NextResponse.json({ success: true, data: warehouse });
      }

      case "getInventory": {
        const warehouseId = z.string().parse(data.warehouseId);
        const inventory = await prisma.hyperlocalInventory.findMany({
          where: { microWarehouseId: warehouseId },
        });

        const warehouse = await prisma.microWarehouse.findUnique({
          where: { id: warehouseId },
        });

        if (!warehouse) {
          return NextResponse.json(
            { error: "Warehouse not found" },
            { status: 404 }
          );
        }

        const utilization = fulfillment.getCapacityUtilization(warehouse);

        return NextResponse.json({
          success: true,
          data: {
            warehouse,
            inventory,
            utilization,
          },
        });
      }

      case "optimizeRoute": {
        const validated = routing.OptimizeRouteRequestSchema.parse(data);
        // Fetch deliveries and warehouse
        const warehouse = await prisma.microWarehouse.findUniqueOrThrow({
          where: { id: validated.warehouseId },
        });

        const deliveries = await prisma.delivery.findMany({
          where: { id: { in: validated.deliveryIds } },
        });

        const routePoints = [
          { id: warehouse.id, lat: warehouse.latitude, lon: warehouse.longitude, name: warehouse.name },
          ...deliveries.map((d) => ({
            id: d.id,
            lat: d.deliveryLat,
            lon: d.deliveryLon,
            name: d.recipientName || "Delivery",
          })),
        ];

        // Use nearest neighbor optimization
        let optimizedRoute = routing.nearestNeighborOptimization(
          routePoints[0],
          routePoints.slice(1)
        );

        // Improve with 2-opt
        optimizedRoute = routing.improveRouteWith2Opt(optimizedRoute.route);

        const duration = routing.estimateRouteDuration(optimizedRoute.route);

        return NextResponse.json({
          success: true,
          data: {
            routeId: `route-${Date.now()}`,
            stops: optimizedRoute.route,
            totalDistanceMeters: Math.round(optimizedRoute.totalDistance),
            estimatedDurationMinutes: duration.totalMinutes,
            sequenceOrder: optimizedRoute.sequenceOrder,
            optimizationScore: 85,
          },
        });
      }

      case "findPartners": {
        const geoZoneId = z.string().parse(data.geoZoneId);
        const availablePartners = await partners.findAvailablePartners(
          geoZoneId,
          data.vehicleType
        );

        return NextResponse.json({
          success: true,
          data: availablePartners,
        });
      }

      case "createDelivery": {
        const delivery = await prisma.delivery.create({
          data: {
            tenantId: z.string().parse(data.tenantId),
            geoZoneId: z.string().parse(data.geoZoneId),
            pickupWarehouseId: z.string().parse(data.pickupWarehouseId),
            deliveryAddress: z.string().parse(data.deliveryAddress),
            deliveryLat: z.number().parse(data.deliveryLat),
            deliveryLon: z.number().parse(data.deliveryLon),
            basePrice: z.number().int().parse(data.basePrice),
            serviceFee: z.number().int().parse(data.serviceFee),
            totalPrice: z.number().int().parse(data.totalPrice),
            status: "PENDING",
            items: data.items ? JSON.stringify(data.items) : null,
          },
        });

        return NextResponse.json({
          success: true,
          data: delivery,
        });
      }

      case "trackDelivery": {
        const deliveryId = z.string().parse(data.deliveryId);
        const tracking = await ux.getDeliveryTracking(deliveryId);

        if (!tracking) {
          return NextResponse.json(
            { error: "Delivery not found" },
            { status: 404 }
          );
        }

        return NextResponse.json({ success: true, data: tracking });
      }

      case "submitFeedback": {
        const feedback = ux.DeliveryFeedbackSchema.parse(data);
        await ux.submitDeliveryFeedback(feedback);

        return NextResponse.json({
          success: true,
          message: "Feedback submitted successfully",
        });
      }

      case "getAnalytics": {
        const geoZoneId = z.string().parse(data.geoZoneId);
        const startDate = z.date().parse(new Date(data.startDate));
        const endDate = z.date().parse(new Date(data.endDate));

        const summary = await analytics.getDailyMetricsSummary(
          geoZoneId,
          startDate,
          endDate
        );

        const kpis = await analytics.calculateKPIs(
          geoZoneId,
          startDate,
          endDate
        );

        return NextResponse.json({
          success: true,
          data: { summary, kpis },
        });
      }

      case "forecastDemand": {
        const geoZoneId = z.string().parse(data.geoZoneId);
        const forecast = await analytics.forecastDemandNext7Days(geoZoneId);

        return NextResponse.json({
          success: true,
          data: forecast,
        });
      }

      case "competitiveAnalysis": {
        const geoZoneId = z.string().parse(data.geoZoneId);
        const analysis = await analytics.analyzeCompetitivePosition(geoZoneId);

        return NextResponse.json({
          success: true,
          data: analysis,
        });
      }

      case "expansionRecommendations": {
        const geoZoneId = z.string().parse(data.geoZoneId);
        const recommendations = await analytics.generateExpansionRecommendations(geoZoneId);

        return NextResponse.json({
          success: true,
          data: recommendations,
        });
      }

      default:
        return NextResponse.json(
          { error: "Unknown action" },
          { status: 400 }
        );
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Validation error",
          details: error.errors,
        },
        { status: 422 }
      );
    }

    if (error instanceof Error) {
      return NextResponse.json(
        {
          error: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/hyperlocal - Get hyperlocal status and health
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // Health check
    const geoZoneCount = await prisma.geoZone.count();
    const warehouseCount = await prisma.microWarehouse.count();
    const partnerCount = await prisma.deliveryPartner.count({
      where: { status: "ACTIVE" },
    });
    const deliveryCount = await prisma.delivery.count({
      where: { status: { not: "CANCELLED" } },
    });

    return NextResponse.json({
      status: "operational",
      stats: {
        geoZones: geoZoneCount,
        warehouses: warehouseCount,
        activePartners: partnerCount,
        activeDeliveries: deliveryCount,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
