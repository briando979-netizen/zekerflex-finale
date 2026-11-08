import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { getStock, updateStock, listLowStock, recordStockCheck, getExpiredStock } from "@/lib/inventory/stock";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get("productId");
    const view = searchParams.get("view"); // "low" or "expired"

    if (view === "low") {
      const stock = await listLowStock(principal.tenantId);
      return NextResponse.json({ stock });
    }

    if (view === "expired") {
      const stock = await getExpiredStock(principal.tenantId);
      return NextResponse.json({ stock });
    }

    if (productId) {
      const stock = await getStock(principal.tenantId, productId);
      return NextResponse.json({ stock });
    }

    throw AppError.validation("productId or view parameter required");
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const { productId, ...updates } = await request.json();

    if (!productId) {
      throw AppError.validation("productId required");
    }

    const stock = await updateStock(principal.tenantId, productId, updates);

    return NextResponse.json({ stock });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const { productId, actualLevel } = await request.json();

    if (!productId || actualLevel === undefined) {
      throw AppError.validation("productId and actualLevel required");
    }

    const stock = await recordStockCheck(principal.tenantId, productId, actualLevel);

    return NextResponse.json({ stock });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
