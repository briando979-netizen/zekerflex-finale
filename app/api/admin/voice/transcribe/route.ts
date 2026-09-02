import { NextResponse } from "next/server";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/admin/voice/transcribe  (multipart: audio)
// Local, sovereign speech-to-text via an OpenAI-compatible /audio/transcriptions
// endpoint (faster-whisper-server / whisper.cpp / speaches). Read-only auth,
// does not touch the database, Redis, sessions or the audit trail.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "PLATFORM_ADMIN");

    if (!env.WHISPER_ENABLED) {
      return NextResponse.json(
        {
          error: {
            code: "PRECONDITION_FAILED",
            message:
              "Lokale spraakherkenning staat uit. Zet WHISPER_ENABLED=true en start een Whisper-server, of gebruik Chrome/Edge (ingebouwde spraakherkenning).",
          },
        },
        { status: 501 },
      );
    }

    const form = await request.formData().catch(() => {
      throw AppError.validation("Verstuur audio als multipart/form-data");
    });
    const audio = form.get("audio");
    if (!(audio instanceof File) || audio.size === 0) {
      throw AppError.validation("Geen audio ontvangen");
    }
    if (audio.size > 20_000_000) throw AppError.validation("Audiofragment te groot");

    const base = env.WHISPER_BASE_URL.replace(/\/+$/, "");
    const upstream = new FormData();
    upstream.append("file", audio, audio.name || "speech.webm");
    upstream.append("model", env.WHISPER_MODEL);
    upstream.append("language", "nl");
    upstream.append("response_format", "json");

    const res = await fetch(`${base}/audio/transcriptions`, {
      method: "POST",
      body: upstream,
      signal: AbortSignal.timeout(45_000),
      ...(env.WHISPER_API_KEY ? { headers: { Authorization: `Bearer ${env.WHISPER_API_KEY}` } } : {}),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 200);
      throw AppError.upstream(`Whisper-server antwoordde ${res.status}: ${detail}`);
    }
    const data = (await res.json()) as { text?: string };
    return NextResponse.json({ text: (data.text ?? "").trim() });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    if (status >= 500) logger.warn("transcribe failed", { error: (err as Error).message });
    return NextResponse.json(body, { status });
  }
}
