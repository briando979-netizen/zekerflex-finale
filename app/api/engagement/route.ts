import { NextResponse } from "next/server";
import { z } from "zod";
import { EngagementKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { recordEngagement } from "@/lib/engagement/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/engagement  { kind }
// The freelancer app pings this on open / key interactions so the Behavioural
// Timing Notifier can learn when this person is actually reachable.

const bodySchema = z.object({
  kind: z
    .nativeEnum(EngagementKind)
    .default(EngagementKind.APP_OPEN),
});

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "FREELANCER");

    const json = await request.json().catch(() => ({}));
    const { kind } = bodySchema.parse(json ?? {});

    const profile = await prisma.freelancerProfile.findUnique({
      where: { userId: principal.userId },
      select: { id: true },
    });
    if (!profile) throw AppError.notFound("No freelancer profile");

    await recordEngagement(profile.id, kind);
    return NextResponse.json({ ok: true, kind });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
