import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireRole("PLATFORM_ADMIN");
    return NextResponse.json({ 
      systems: ["pricing", "forecasting", "strategy", "optimization", "profitability", "intelligence"],
      status: "operational"
    });
  } catch (err) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireRole("PLATFORM_ADMIN");
    const body = await request.json();
    
    if (body.action === "calculate-price") {
      return NextResponse.json({ price: body.data.basePrice * 1.15 });
    }
    
    if (body.action === "forecast") {
      return NextResponse.json({ forecast: [] });
    }
    
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
