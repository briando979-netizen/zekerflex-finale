import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { isServerTtsEnabled, synthesize } from "@/lib/voice/tts";
import { withAdminAccess } from "@/lib/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const paramsSchema = z.object({ id: z.string().min(1).max(128) });

// GET /api/voice/announcements/:id/audio
// Server-side Piper WAV. 501 when Piper is not configured (client then falls
// back to the browser's speech synthesis).
export const GET = withAdminAccess<{ id: string }>(["PLATFORM_ADMIN"], async (_req, { params }) => {
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
});
