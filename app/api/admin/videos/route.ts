import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";
import { z } from "zod";

export const dynamic = "force-dynamic";

const videoSchema = z.object({
  title: z.string().min(1),
  description: z.string(),
  category: z.enum(["tutorial", "walkthrough", "guide", "story", "faq"]),
  role: z.enum(["general", "employer", "worker", "admin"]),
  durationSeconds: z.number().positive(),
  thumbnailUrl: z.string().url(),
  hostedOn: z.enum(["vimeo", "youtube", "self-hosted"]),
  hostId: z.string().min(1),
  qualities: z.array(z.enum(["360p", "720p", "1080p", "4K"])),
  subtitles: z.array(z.object({ language: z.string(), url: z.string().url() })).optional(),
  playlist: z.string().optional(),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePrincipal();

    const category = request.nextUrl.searchParams.get("category");
    const role = request.nextUrl.searchParams.get("role");

    const videos = await prisma.video.findMany({
      where: {
        ...(category && { category }),
        ...(role && { role }),
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ videos });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePrincipal();

    const body = await request.json();
    const data = videoSchema.parse(body);

    const video = await prisma.video.create({
      data: {
        ...data,
        views: 0,
        watchTime: 0,
      },
    });

    return NextResponse.json({ video }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
