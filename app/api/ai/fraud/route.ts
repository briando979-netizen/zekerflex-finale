import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { detectFraud } from "@/lib/ai/engine-index";
import { toErrorBody } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    await requireRole("PLATFORM_ADMIN");
    const { userId, action, metadata } = await request.json();

    const signal = await detectFraud(userId, action, metadata);
    return NextResponse.json({ signal }, { status: 200 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
