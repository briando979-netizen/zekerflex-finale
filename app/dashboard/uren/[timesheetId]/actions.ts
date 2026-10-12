"use server";

import { revalidatePath } from "next/cache";
import { requirePrincipal } from "@/lib/auth";
import { acceptHoursCorrection, rejectHoursCorrection } from "@/lib/disputes/respond";
import { AppError } from "@/lib/errors";

export interface RespondResult {
  ok: boolean;
  message: string;
}

export async function acceptCorrectionAction(disputeId: string, timesheetId: string): Promise<RespondResult> {
  try {
    const principal = await requirePrincipal();
    await acceptHoursCorrection(disputeId, principal.userId);
    revalidatePath(`/dashboard/uren/${timesheetId}`);
    return { ok: true, message: "Correctie geaccepteerd. Je uren staan nu klaar voor goedkeuring." };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, message: err.message };
    return { ok: false, message: "Reageren mislukt. Probeer het opnieuw." };
  }
}

export async function rejectCorrectionAction(disputeId: string, timesheetId: string): Promise<RespondResult> {
  try {
    const principal = await requirePrincipal();
    await rejectHoursCorrection(disputeId, principal.userId);
    revalidatePath(`/dashboard/uren/${timesheetId}`);
    return { ok: true, message: "Voorstel afgewezen. ZekerFlex beoordeelt dit nu onafhankelijk." };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, message: err.message };
    return { ok: false, message: "Reageren mislukt. Probeer het opnieuw." };
  }
}
