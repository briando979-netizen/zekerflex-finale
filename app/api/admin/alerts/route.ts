import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const level = request.nextUrl.searchParams.get("level");
  const resolved = request.nextUrl.searchParams.get("resolved") === "true";

  const alerts = [
    {
      id: "alert-001",
      deploymentId: "dep-001",
      level: "warning",
      title: "High Build Time",
      message: "Build took 245ms, 10% above average",
      channels: ["email", "slack"],
      createdAt: new Date(Date.now() - 300000).toISOString(),
    },
    {
      id: "alert-002",
      deploymentId: "dep-001",
      level: "info",
      title: "Deployment Completed",
      message: "Deployment dep-001 completed successfully",
      channels: ["dashboard"],
      createdAt: new Date(Date.now() - 60000).toISOString(),
      resolvedAt: new Date(Date.now() - 30000).toISOString(),
    },
  ];

  return NextResponse.json({ alerts });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { level, title, message, channels, deploymentId } = body;

  if (!level || !title || !message) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  return NextResponse.json(
    {
      id: `alert-${Date.now()}`,
      level,
      title,
      message,
      channels: channels || ["dashboard"],
      deploymentId,
      createdAt: new Date().toISOString(),
    },
    { status: 201 }
  );
}

export async function PATCH(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  const body = await request.json();
  const { action } = body;

  if (!id) {
    return NextResponse.json(
      { error: "Missing alert id" },
      { status: 400 }
    );
  }

  if (action === "resolve") {
    return NextResponse.json({
      id,
      resolvedAt: new Date().toISOString(),
    });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
