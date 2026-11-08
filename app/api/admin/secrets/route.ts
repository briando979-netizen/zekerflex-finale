import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const environment = request.nextUrl.searchParams.get("environment") || "production";

  const secrets = [
    {
      key: "DATABASE_URL",
      environment,
      masked: "postgres://user:****@localhost:5432/zekerflex",
      lastUsed: new Date().toISOString(),
    },
    {
      key: "API_KEY",
      environment,
      masked: "sk_live_********",
      lastUsed: new Date(Date.now() - 60000).toISOString(),
    },
    {
      key: "JWT_SECRET",
      environment,
      masked: "eyJ****...",
      lastUsed: new Date(Date.now() - 3600000).toISOString(),
    },
  ];

  return NextResponse.json({ secrets });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { key, value, environment } = body;

  if (!key || !value || !environment) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  if (!key.match(/^[A-Z_][A-Z0-9_]*$/)) {
    return NextResponse.json(
      { error: "Key must be uppercase with underscores only" },
      { status: 400 }
    );
  }

  return NextResponse.json(
    {
      key,
      environment,
      created: new Date().toISOString(),
    },
    { status: 201 }
  );
}

export async function DELETE(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key");
  const environment = request.nextUrl.searchParams.get("environment");

  if (!key || !environment) {
    return NextResponse.json(
      { error: "Missing key or environment" },
      { status: 400 }
    );
  }

  return NextResponse.json({ deleted: true });
}
