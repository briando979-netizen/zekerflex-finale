import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { startOfToday } from "@/lib/sales/campaign";
import { enginePaused, pauseEngine, resumeEngine, runSalesEngineTick } from "@/lib/sales/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "PLATFORM_ADMIN");

    const [runs, paused, sentToday, scheduled, dueCount] = await Promise.all([
      prisma.salesEngineRun.findMany({ orderBy: { startedAt: "desc" }, take: 15 }),
      enginePaused(),
      prisma.salesOutreach.count({ where: { sentAt: { gte: startOfToday() } } }),
      prisma.salesLead.findMany({
        where: { nextActionAt: { not: null }, suppressed: false, repliedAt: null },
        orderBy: { nextActionAt: "asc" },
        take: 10,
        select: { id: true, companyName: true, nextActionAt: true, sequenceStep: true },
      }),
      prisma.salesLead.count({
        where: { status: "QUEUED", suppressed: false },
      }),
    ]);

    return NextResponse.json({
      config: {
        engineEnabled: env.SALES_ENGINE_ENABLED,
        autopilotEnabled: env.SALES_AUTOPILOT_ENABLED,
        globalDailyCap: env.SALES_DAILY_CAP_GLOBAL,
        tickMinutes: env.SALES_ENGINE_TICK_MINUTES,
      },
      paused,
      sentToday,
      queuedForReview: dueCount,
      scheduled,
      runs,
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

const postSchema = z.object({ action: z.enum(["pause", "resume", "run"]) });

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "PLATFORM_ADMIN");
    const json = await request.json().catch(() => {
      throw AppError.validation("Body must be JSON");
    });
    const { action } = postSchema.parse(json);

    if (action === "pause") {
      await pauseEngine(principal.userId);
      return NextResponse.json({ ok: true, paused: true });
    }
    if (action === "resume") {
      await resumeEngine(principal.userId);
      return NextResponse.json({ ok: true, paused: false });
    }
    const result = await runSalesEngineTick({ force: true });
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
