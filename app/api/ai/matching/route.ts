import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { computeMatchScore, getRecommendations } from "@/lib/ai/engine-index";
import { AppError, toErrorBody } from "@/lib/errors";
import { z } from "zod";

export const dynamic = "force-dynamic";

const matchSchema = z.object({
  userId: z.string(),
  targetId: z.string(),
});

const recommendSchema = z.object({
  limit: z.number().default(10),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePrincipal();
    const body = await request.json();
    const { userId, targetId } = matchSchema.parse(body);

    const score = await computeMatchScore(userId, targetId);
    return NextResponse.json({ score }, { status: 200 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "10");

    const recommendations = await getRecommendations(principal.userId, limit);
    return NextResponse.json({ recommendations }, { status: 200 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
