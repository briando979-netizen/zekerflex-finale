import { NextResponse } from "next/server";
import { z } from "zod";
import { AnnouncementPriority } from "@prisma/client";
import { getPrincipal, hasRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { checkInternalToken } from "@/lib/internal-auth";
import { announce } from "@/lib/voice/announce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/voice/announce
// For build hooks / CI ("build is groen") and internal callers. Accepts either
// the internal cron token or a PLATFORM_ADMIN session.

const bodySchema = z.object({
  text: z.string().trim().min(2).max(600),
  category: z.string().trim().min(2).max(40).default("status"),
  priority: z.nativeEnum(AnnouncementPriority).default("NORMAL"),
  source: z.string().trim().max(40).default("api"),
  rephrase: z.boolean().default(false),
});

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const internal = checkInternalToken(request);
    if (!internal.ok) {
      const principal = await getPrincipal();
      if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
        throw AppError.forbidden("Voice announce requires the internal token or PLATFORM_ADMIN");
      }
    }

    const json = await request.json().catch(() => {
      throw AppError.validation("Body must be JSON");
    });
    const parsed = bodySchema.parse(json);

    const row = await announce(parsed);
    return NextResponse.json(
      row
        ? { ok: true, id: row.id, text: row.text }
        : { ok: false, reason: "voice disabled" },
      { status: row ? 201 : 200 },
    );
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
