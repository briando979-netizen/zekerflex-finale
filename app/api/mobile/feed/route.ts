import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const feed = { shifts: 0, messages: 0, notifications: 0 };
    return NextResponse.json({ feed });
  } catch (err) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
