import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { advancedScheduling, optimizationEngine } from "@/lib/scheduling/scheduler-2";
import { AppError, toErrorBody } from "@/lib/errors";
import { z } from "zod";

export const dynamic = "force-dynamic";

const optimizeSchema = z.object({
  scheduleId: z.string(),
  staffIds: z.array(z.string()),
  shiftIds: z.array(z.string()),
  costWeighting: z.number().default(0.6),
  satisfactionWeighting: z.number().default(0.4),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    await requireRole("PLATFORM_ADMIN");
    const body = await request.json();
    const params = optimizeSchema.parse(body);

    const optimized = await advancedScheduling({
      staffIds: params.staffIds,
      shiftIds: params.shiftIds,
      skills: {},
      preferences: {},
    });

    const recommendations = await optimizationEngine({
      costWeighting: params.costWeighting,
      satisfactionWeighting: params.satisfactionWeighting,
      scheduleId: params.scheduleId,
    });

    return NextResponse.json({ optimized, recommendations });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
