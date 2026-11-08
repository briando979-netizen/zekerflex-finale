import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    status: "operational",
    lastDeploy: new Date().toISOString(),
    version: "1.0.0",
    uptime: "99.9%",
  });
}
