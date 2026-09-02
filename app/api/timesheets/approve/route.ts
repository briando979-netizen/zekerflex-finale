import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { approveTimesheet } from "@/lib/timesheets/approve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  timesheetId: z.string().min(1).max(128),
  correctedBillableMinutes: z.number().int().positive().max(24 * 60).optional(),
  overrideGpsCheck: z.boolean().optional(),
  correctionNote: z.string().trim().min(3).max(500).optional(),
});

/**
 * POST /api/timesheets/approve
 *
 * Approves a submitted (or disputed) timesheet, emits the two reverse-billing
 * invoices and triggers the instant SEPA payout. Returns a summary of the
 * invoices and the payout status.
 *
 * Auth: LOCAL_MANAGER / HQ_ADMIN scoped to the timesheet's location, or
 * PLATFORM_ADMIN. Correcting hours or overriding the GPS check additionally
 * requires that the caller is not the freelancer being paid (enforced by role).
 */
export async function POST(request: Request): Promise<NextResponse> {
  const log = logger.child({ route: "POST /api/timesheets/approve" });

  try {
    const principal = await requirePrincipal();
    requireRole(principal, "LOCAL_MANAGER", "HQ_ADMIN", "PLATFORM_ADMIN");

    const json = await request.json().catch(() => {
      throw AppError.validation("Request body must be valid JSON");
    });
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      throw AppError.validation("Invalid request body", parsed.error.flatten());
    }

    const result = await approveTimesheet({
      timesheetId: parsed.data.timesheetId,
      principal,
      ...(parsed.data.correctedBillableMinutes !== undefined
        ? { correctedBillableMinutes: parsed.data.correctedBillableMinutes }
        : {}),
      ...(parsed.data.overrideGpsCheck !== undefined
        ? { overrideGpsCheck: parsed.data.overrideGpsCheck }
        : {}),
      ...(parsed.data.correctionNote !== undefined
        ? { correctionNote: parsed.data.correctionNote }
        : {}),
    });

    const httpStatus =
      result.payout.status === "FAILED" ? 202 : 200; // 202: approved, payout retrying
    return NextResponse.json(result, { status: httpStatus });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    if (status >= 500) {
      log.error("approval failed", { error: (err as Error).message });
    } else {
      log.warn("approval rejected", { status, code: body.error.code });
    }
    return NextResponse.json(body, { status });
  }
}
