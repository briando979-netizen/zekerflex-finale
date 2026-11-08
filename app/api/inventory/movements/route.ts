import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { recordMovement, listMovements, getAuditTrail, getMovementsByType } from "@/lib/inventory/movements";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();

    const movement = await recordMovement(principal.tenantId, {
      ...body,
      createdBy: principal.userId,
    });

    return NextResponse.json({ movement }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get("productId");
    const type = searchParams.get("type");
    const view = searchParams.get("view"); // "audit" or "type"

    if (view === "audit" && productId) {
      const audit = await getAuditTrail(principal.tenantId, productId);
      return NextResponse.json({ movements: audit });
    }

    if (view === "type" && type) {
      const movements = await getMovementsByType(principal.tenantId, type as any);
      return NextResponse.json({ movements });
    }

    const movements = await listMovements(principal.tenantId, {
      productId: productId || undefined,
      type: type as any,
    });

    return NextResponse.json({ movements });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
