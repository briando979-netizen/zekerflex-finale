import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth/require-principal";
import { jsonError } from "@/lib/http/errors";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  userId: z.string(),
  sessionId: z.string(),
  userAgent: z.string().optional(),
  metrics: z.object({
    fcp: z.number().optional(),
    lcp: z.number().optional(),
    cls: z.number().optional(),
  }).optional(),
});

/**
 * POST /api/mobile/sessions — Create mobile session
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal(request);
    const parsed = schema.safeParse(await request.json().catch(() => ({})));

    if (!parsed.success) {
      return jsonError(
        "Ongeldige sessie gegevens",
        422,
      );
    }

    const { userId, sessionId, userAgent, metrics } = parsed.data;

    // Verify user
    if (principal.id !== userId) {
      return jsonError(
        "Ongeautoriseerd",
        403,
      );
    }

    // Create or update session
    const session = await prisma.mobileSession.upsert({
      where: { sessionId },
      create: {
        userId,
        sessionId,
        userAgent: userAgent || "unknown",
        metricsCount: metrics ? 1 : 0,
        avgLcp: metrics?.lcp,
        avgCls: metrics?.cls,
      },
      update: {
        userId,
        metricsCount: { increment: 1 },
        lastActiveAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      session: {
        id: session.id,
        sessionId: session.sessionId,
        startedAt: session.startedAt,
      },
    });
  } catch (error) {
    return jsonError(
      (error as Error).message || "Fout bij creëren sessie",
      500,
    );
  }
}
