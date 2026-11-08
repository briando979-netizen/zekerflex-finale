import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const version = request.nextUrl.searchParams.get("version");
  const deployment = request.nextUrl.searchParams.get("deployment");

  const artifacts = [
    {
      id: "artifact-001",
      name: "zekerflex-app",
      version: "1.2.3",
      deploymentId: "dep-001",
      branch: "main",
      commit: "c02f027d",
      size: 245000,
      format: "application/zip",
      checksum: "sha-abc123",
      createdAt: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: "artifact-002",
      name: "zekerflex-app",
      version: "1.2.2",
      deploymentId: "dep-002",
      branch: "main",
      commit: "df9dcdca",
      size: 244000,
      format: "application/zip",
      checksum: "sha-def456",
      createdAt: new Date(Date.now() - 7200000).toISOString(),
    },
  ];

  return NextResponse.json({ artifacts });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, version, deploymentId, branch, commit, size } = body;

  if (!name || !version || !deploymentId) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  return NextResponse.json(
    {
      id: `artifact-${Date.now()}`,
      name,
      version,
      deploymentId,
      branch,
      commit,
      size,
      checksum: `sha-${Math.random().toString(16).slice(2)}`,
      createdAt: new Date().toISOString(),
    },
    { status: 201 }
  );
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");

  if (!id) {
    return NextResponse.json(
      { error: "Missing artifact id" },
      { status: 400 }
    );
  }

  return NextResponse.json({ deleted: true });
}
