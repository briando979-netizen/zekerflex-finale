import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const appId = request.nextUrl.searchParams.get("appId");

    if (!appId) {
      return NextResponse.json({ error: "appId required" }, { status: 400 });
    }

    // In production, fetch from analytics store/database
    const stats = {
      appId,
      totalRequests: 45230,
      totalErrors: 127,
      errorRate: 0.0028,
      avgLatency: 127,
      costEstimate: 45.23,
      topEndpoints: [
        { endpoint: "/api/users", requestCount: 12500 },
        { endpoint: "/api/orders", requestCount: 8900 },
        { endpoint: "/api/products", requestCount: 15230 },
      ],
    };

    return NextResponse.json(stats);
  } catch (err) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();

    // Record usage metrics
    const { appId, endpoint, method, statusCode, latency, requestSize, responseSize } = body;

    // In production, save to database
    const recorded = {
      appId,
      endpoint,
      method,
      statusCode,
      latency,
      recorded: true,
    };

    return NextResponse.json(recorded, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: "Failed to record metrics" }, { status: 500 });
  }
}
