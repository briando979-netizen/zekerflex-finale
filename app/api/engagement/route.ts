import { NextResponse } from "next/server";
import { z } from "zod";
import { EngagementKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { recordEngagement } from "@/lib/engagement/events";
import { appOpenTelt } from "@/lib/engagement/app-open";

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
    if (!profile) throw AppError.notFound("Je hebt nog geen werkersprofiel. Maak eerst je profiel af.");

    // "App geopend" telt hoogstens eens per half uur (lib/engagement/app-open.ts),
    // ook als de app zijn eigen rem kwijt is (privévenster, meerdere tabbladen).
    if (kind === EngagementKind.APP_OPEN) {
      const vorige = await prisma.engagementEvent.findFirst({
        where: { freelancerId: profile.id, kind: EngagementKind.APP_OPEN },
        orderBy: { occurredAt: "desc" },
        select: { occurredAt: true },
      });
      if (!appOpenTelt(vorige?.occurredAt.getTime() ?? null, Date.now())) {
        return NextResponse.json({ ok: true, kind, geteld: false });
      }
    }

    await recordEngagement(profile.id, kind);
    return NextResponse.json({ ok: true, kind, geteld: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
