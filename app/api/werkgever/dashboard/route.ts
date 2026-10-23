import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { employerDashboardStats } from "@/lib/dashboard/employer-dashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/werkgever/dashboard — Shopify-stijl KPI's voor de eigen organisatie.
export async function GET(): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    return NextResponse.json(await employerDashboardStats(principal));
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
