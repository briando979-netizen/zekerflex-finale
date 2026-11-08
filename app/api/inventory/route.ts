import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import * as stockTracking from "@/lib/inventory/stock-tracking";
import * as assets from "@/lib/inventory/assets";
import * as reservations from "@/lib/inventory/reservations";
import * as auditing from "@/lib/inventory/auditing";
import * as forecasting from "@/lib/inventory/forecasting";
import * as integrations from "@/lib/inventory/integrations";
import { AppError } from "@/lib/errors";

const moveStockSchema = z.object({
  productId: z.string(),
  tenantId: z.string(),
  type: z.enum(["PURCHASE", "SALE", "ADJUSTMENT", "TRANSFER", "WRITE_OFF", "RETURN"]),
  quantity: z.number().int(),
  reference: z.string().optional(),
  notes: z.string().optional(),
  createdBy: z.string().optional(),
});

const createReservationSchema = z.object({
  tenantId: z.string(),
  productId: z.string(),
  quantity: z.number().int().min(1),
  reservedBy: z.string(),
  holdUntil: z.coerce.date(),
});

const createAssetSchema = z.object({
  tenantId: z.string(),
  name: z.string(),
  category: z.string(),
  purchaseDateCents: z.number().int().min(0),
  purchaseDate: z.coerce.date(),
  depreciationYears: z.number().int().min(1),
});

const recordCountSchema = z.object({
  tenantId: z.string(),
  productId: z.string(),
  countedQuantity: z.number().int().min(0),
  countedBy: z.string(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = request.nextUrl.searchParams.get("action");

    if (!action) {
      throw AppError.validation("Action is required");
    }

    switch (action) {
      case "move-stock": {
        const data = moveStockSchema.parse(body);
        const movement = await stockTracking.recordStockMovement(data);
        return NextResponse.json(movement);
      }

      case "get-stock": {
        const { productId } = z.object({ productId: z.string() }).parse(body);
        const stock = await stockTracking.getStockLevel(productId);
        return NextResponse.json(stock);
      }

      case "create-reservation": {
        const data = createReservationSchema.parse(body);
        const reservation = await reservations.createReservation(data);
        return NextResponse.json(reservation);
      }

      case "confirm-reservation": {
        const { reservationId } = z.object({ reservationId: z.string() }).parse(body);
        const confirmed = await reservations.confirmReservation(reservationId);
        return NextResponse.json(confirmed);
      }

      case "get-reservations": {
        const { productId } = z.object({ productId: z.string() }).parse(body);
        const prods = await reservations.getProductReservations(productId);
        return NextResponse.json(prods);
      }

      case "create-asset": {
        const data = createAssetSchema.parse(body);
        const asset = await assets.createAsset(data);
        return NextResponse.json(asset);
      }

      case "get-asset": {
        const { assetId } = z.object({ assetId: z.string() }).parse(body);
        const asset = await assets.getAsset(assetId);
        return NextResponse.json(asset);
      }

      case "get-tenant-assets": {
        const { tenantId } = z.object({ tenantId: z.string() }).parse(body);
        const result = await assets.getTenantAssets(tenantId);
        return NextResponse.json(result);
      }

      case "record-count": {
        const data = recordCountSchema.parse(body);
        const audit = await auditing.recordPhysicalCount(data);
        return NextResponse.json(audit);
      }

      case "get-discrepancies": {
        const { tenantId } = z.object({ tenantId: z.string() }).parse(body);
        const result = await auditing.getTenantDiscrepancies(tenantId);
        return NextResponse.json(result);
      }

      case "get-accuracy-report": {
        const { tenantId } = z.object({ tenantId: z.string() }).parse(body);
        const report = await auditing.generateAccuracyReport(tenantId);
        return NextResponse.json(report);
      }

      case "update-forecast": {
        const { productId, tenantId } = z.object({ productId: z.string(), tenantId: z.string() }).parse(body);
        const forecast = await forecasting.updateProductForecast(productId, tenantId);
        return NextResponse.json(forecast);
      }

      case "get-forecast": {
        const { productId } = z.object({ productId: z.string() }).parse(body);
        const forecast = await forecasting.getProductForecast(productId);
        return NextResponse.json(forecast);
      }

      case "get-low-stock-forecast": {
        const { tenantId } = z.object({ tenantId: z.string() }).parse(body);
        const forecasts = await forecasting.getLowStockForecasts(tenantId);
        return NextResponse.json(forecasts);
      }

      case "generate-po": {
        const { tenantId, supplierId } = z.object({ tenantId: z.string(), supplierId: z.string() }).parse(body);
        const po = await integrations.generatePOFromLowStock(tenantId, supplierId);
        return NextResponse.json(po);
      }

      case "get-vendor-performance": {
        const { supplierId } = z.object({ supplierId: z.string() }).parse(body);
        const performance = await integrations.getVendorPerformance(supplierId);
        return NextResponse.json(performance);
      }

      default:
        throw AppError.validation(`Unknown action: ${action}`);
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: error.errors }, { status: 422 });
    }
    if (error instanceof AppError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const action = request.nextUrl.searchParams.get("action");
    const productId = request.nextUrl.searchParams.get("productId");
    const tenantId = request.nextUrl.searchParams.get("tenantId");

    if (!action) {
      throw AppError.validation("Action is required");
    }

    switch (action) {
      case "stock-level": {
        if (!productId) throw AppError.validation("productId required");
        const stock = await stockTracking.getStockLevel(productId);
        return NextResponse.json(stock);
      }

      case "low-stock": {
        if (!tenantId) throw AppError.validation("tenantId required");
        const items = await stockTracking.getLowStockItems(tenantId);
        return NextResponse.json(items);
      }

      case "expiring-stock": {
        if (!tenantId) throw AppError.validation("tenantId required");
        const items = await stockTracking.getExpiringStockItems(tenantId);
        return NextResponse.json(items);
      }

      case "asset": {
        if (!productId) throw AppError.validation("assetId required");
        const asset = await assets.getAsset(productId);
        return NextResponse.json(asset);
      }

      case "tenant-assets": {
        if (!tenantId) throw AppError.validation("tenantId required");
        const result = await assets.getTenantAssets(tenantId);
        return NextResponse.json(result);
      }

      case "available-stock": {
        if (!productId) throw AppError.validation("productId required");
        const available = await reservations.getAvailableStock(productId);
        return NextResponse.json(available);
      }

      case "forecast": {
        if (!productId) throw AppError.validation("productId required");
        const forecast = await forecasting.getProductForecast(productId);
        return NextResponse.json(forecast);
      }

      case "forecast-report": {
        if (!tenantId) throw AppError.validation("tenantId required");
        const report = await forecasting.generateForecastReport(tenantId);
        return NextResponse.json(report);
      }

      case "pending-pos": {
        if (!tenantId) throw AppError.validation("tenantId required");
        const pos = await integrations.getPendingPOs(tenantId);
        return NextResponse.json(pos);
      }

      case "suppliers": {
        if (!tenantId) throw AppError.validation("tenantId required");
        const suppliers = await integrations.getSuppliers(tenantId);
        return NextResponse.json(suppliers);
      }

      default:
        throw AppError.validation(`Unknown action: ${action}`);
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: error.errors }, { status: 422 });
    }
    if (error instanceof AppError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
