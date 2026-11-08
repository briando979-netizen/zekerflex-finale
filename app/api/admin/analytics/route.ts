import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get("type") || "performance";

  if (type === "performance") {
    return NextResponse.json({
      metrics: [
        {
          timestamp: new Date(Date.now() - 300000).toISOString(),
          buildTime: 145,
          testTime: 85,
          bundleSize: 245000,
          errorRate: 0,
          uptime: 99.9,
        },
        {
          timestamp: new Date(Date.now() - 200000).toISOString(),
          buildTime: 152,
          testTime: 88,
          bundleSize: 247000,
          errorRate: 0,
          uptime: 99.9,
        },
        {
          timestamp: new Date().toISOString(),
          buildTime: 148,
          testTime: 86,
          bundleSize: 245500,
          errorRate: 0,
          uptime: 99.95,
        },
      ],
    });
  }

  if (type === "tests") {
    return NextResponse.json({
      metrics: [
        {
          timestamp: new Date(Date.now() - 300000).toISOString(),
          totalTests: 456,
          passedTests: 450,
          failedTests: 6,
          skippedTests: 0,
          coverage: 82,
          duration: 85,
        },
        {
          timestamp: new Date(Date.now() - 200000).toISOString(),
          totalTests: 460,
          passedTests: 455,
          failedTests: 5,
          skippedTests: 0,
          coverage: 83,
          duration: 88,
        },
        {
          timestamp: new Date().toISOString(),
          totalTests: 465,
          passedTests: 461,
          failedTests: 4,
          skippedTests: 0,
          coverage: 84,
          duration: 86,
        },
      ],
    });
  }

  return NextResponse.json({ error: "Unknown type" }, { status: 400 });
}
