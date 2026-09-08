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
        result.track === "payroll"
          ? result.advance
            ? `Goedgekeurd. € ${(result.advance.netCents / 100).toFixed(2).replace(".", ",")} is als voorschot uitbetaald; de rest volgt op de loonstrook van week ${result.payroll?.weekLabel ?? ""}.`.trim()
            : `Goedgekeurd. De uren worden verloond in de payroll van week ${result.payroll?.weekLabel ?? ""}.`.trim()
          : result.payout?.status === "FAILED"
            ? "Goedgekeurd. De uitbetaling wordt automatisch opnieuw geprobeerd."
            : "Goedgekeurd en uitbetaling gestart.",
    };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, message: err.message };
    return { ok: false, message: "Goedkeuren mislukt. Probeer het opnieuw." };
  }
}
