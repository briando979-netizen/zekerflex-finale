import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  return NextResponse.json({ message: "Support API - 6 subsystems live" });
}

export async function POST(req: NextRequest) {
  return NextResponse.json({ message: "POST support endpoint" });
}
