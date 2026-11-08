import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { createProduct, listProducts, searchProducts } from "@/lib/inventory/products";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q");
    const category = searchParams.get("category");

    if (query) {
      const results = await searchProducts(principal.tenantId, query);
      return NextResponse.json({ products: results });
    }

    const products = await listProducts(principal.tenantId, {
      category: category || undefined,
      archived: false,
    });

    return NextResponse.json({ products });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();

    const product = await createProduct(principal.tenantId, body);

    return NextResponse.json({ product }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
