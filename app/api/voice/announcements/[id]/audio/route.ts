import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { isServerTtsEnabled, synthesize } from "@/lib/voice/tts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const paramsSchema = z.object({ id: z.string().min(1).max(128) });

// GET /api/voice/announcements/:id/audio
// Server-side Piper WAV. 501 when Piper is not configured (client then falls
// back to the browser's speech synthesis).
export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "PLATFORM_ADMIN");
    const { id } = paramsSchema.parse(params);

    if (!isServerTtsEnabled()) {
      return NextResponse.json(
        { error: { code: "PRECONDITION_FAILED", message: "Server TTS (Piper) not configured" } },
        { status: 501 },
      );
    }

    const row = await prisma.voiceAnnouncement.findUnique({ where: { id } });
    if (!row) throw AppError.notFound("Announcement not found");

    const wav = await synthesize(row.text);
    return new Response(new Uint8Array(wav), {
      headers: {
        "Content-Type": "audio/wav",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
