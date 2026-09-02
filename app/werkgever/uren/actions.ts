"use server";

import { revalidatePath } from "next/cache";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { approveTimesheet } from "@/lib/timesheets/approve";
import { AppError } from "@/lib/errors";

export interface ApproveResult {
  ok: boolean;
  message: string;
}

export async function approveTimesheetAction(timesheetId: string): Promise<ApproveResult> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "LOCAL_MANAGER", "HQ_ADMIN", "PLATFORM_ADMIN");
    const result = await approveTimesheet({ timesheetId, principal });
    revalidatePath("/werkgever/uren");
    revalidatePath("/werkgever");
    return {
      ok: true,
      message:
        result.payout.status === "FAILED"
          ? "Goedgekeurd. De uitbetaling wordt automatisch opnieuw geprobeerd."
          : "Goedgekeurd en uitbetaling gestart.",
    };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, message: err.message };
    return { ok: false, message: "Goedkeuren mislukt. Probeer het opnieuw." };
  }
}
