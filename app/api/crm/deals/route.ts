import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import * as crmDeals from "@/lib/crm/deals";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const stage = request.nextUrl.searchParams.get("stage") || undefined;

    const deals = await crmDeals.listDeals(
      principal.tenantId,
      stage as any
    );
    return NextResponse.json({ deals });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();

    const deal = await crmDeals.createDeal(
      principal.tenantId,
      principal.userId,
      body
    );

    return NextResponse.json({ deal }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
