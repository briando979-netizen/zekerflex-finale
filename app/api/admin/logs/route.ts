import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const level = request.nextUrl.searchParams.get("level");
  const source = request.nextUrl.searchParams.get("source");
  const deploymentId = request.nextUrl.searchParams.get("deploymentId");
  const limit = parseInt(request.nextUrl.searchParams.get("limit") || "100");

  const logs = [
    {
      id: "log-001",
      timestamp: new Date(Date.now() - 60000).toISOString(),
      level: "info",
      source: "test-runner",
      message: "All tests passed",
      deploymentId: "dep-001",
    },
    {
      id: "log-002",
      timestamp: new Date(Date.now() - 45000).toISOString(),
      level: "info",
      source: "builder",
      message: "Build completed successfully",
      deploymentId: "dep-001",
    },
    {
      id: "log-003",
      timestamp: new Date(Date.now() - 30000).toISOString(),
      level: "warn",
      source: "linter",
      message: "Unused variable detected",
      deploymentId: "dep-001",
      context: { file: "app/page.tsx", line: 42 },
    },
    {
      id: "log-004",
      timestamp: new Date(Date.now() - 15000).toISOString(),
      level: "info",
      source: "monitor",
      message: "Health check passed",
      deploymentId: "dep-001",
    },
  ];

  return NextResponse.json({ logs });
}

export async function DELETE(request: NextRequest) {
  const olderThan = request.nextUrl.searchParams.get("olderThan");

  if (!olderThan) {
    return NextResponse.json(
      { error: "Missing olderThan parameter" },
      { status: 400 }
    );
  }

  return NextResponse.json({
    deleted: 42,
    message: "Logs older than specified date have been deleted",
  });
}
