import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";
import { z } from "zod";

export const dynamic = "force-dynamic";

const analyticsSchema = z.object({
  videoId: z.string(),
  watchedSeconds: z.number().nonnegative(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePrincipal();

    const body = await request.json();
    const { videoId, watchedSeconds } = analyticsSchema.parse(body);

    const video = await prisma.video.update({
      where: { id: videoId },
      data: {
        views: { increment: 1 },
        watchTime: { increment: watchedSeconds },
      },
    });

    return NextResponse.json({ tracked: true, video });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePrincipal();

    const popular = await prisma.video.findMany({
      orderBy: { views: "desc" },
      take: 10,
    });

    const mostWatched = await prisma.video.findMany({
      orderBy: { watchTime: "desc" },
      take: 10,
    });

    return NextResponse.json({ popular, mostWatched });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
