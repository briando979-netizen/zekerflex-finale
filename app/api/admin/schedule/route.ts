import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const status = request.nextUrl.searchParams.get("status");

  const scheduled = [
    {
      id: "sched-001",
      branch: "main",
      scheduledFor: new Date(Date.now() + 3600000).toISOString(),
      status: "scheduled",
      priority: "high",
      createdBy: "admin",
      createdAt: new Date().toISOString(),
    },
    {
      id: "sched-002",
      branch: "develop",
      scheduledFor: new Date(Date.now() + 7200000).toISOString(),
      status: "scheduled",
      priority: "medium",
      createdBy: "system",
      createdAt: new Date(Date.now() - 3600000).toISOString(),
    },
  ];

  return NextResponse.json({ deployments: scheduled });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { branch, scheduledFor, priority } = body;

  if (!branch || !scheduledFor) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  return NextResponse.json(
    {
      id: `sched-${Date.now()}`,
      branch,
      scheduledFor,
      status: "scheduled",
      priority: priority || "medium",
      createdAt: new Date().toISOString(),
    },
    { status: 201 }
  );
}

export async function PATCH(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  const body = await request.json();
  const { status, newTime } = body;

  if (!id) {
    return NextResponse.json(
      { error: "Missing deployment id" },
      { status: 400 }
    );
  }

  return NextResponse.json({
    id,
    status: status || "updated",
    newTime: newTime || new Date().toISOString(),
  });
}
