"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { resolveDispute, type DisputeDecision } from "@/lib/disputes/resolve";
import { approveTimesheet } from "@/lib/timesheets/approve";

const resolveSchema = z.object({
  disputeId: z.string().min(1).max(128),
  decision: z.enum(["APPROVE_CLAIMED", "OVERRULE"]),
  resolvedMinutes: z.coerce.number().int().nonnegative().max(24 * 60).optional(),
  note: z.string().trim().min(3).max(500),
  // When set, immediately run approval (invoices + payout) after resolution.
  approveAfterResolve: z.coerce.boolean().optional(),
});

export interface ActionState {
  ok: boolean;
  message: string;
}

export async function resolveDisputeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "DISPUTE_MANAGER", "HQ_ADMIN", "PLATFORM_ADMIN");

    const parsed = resolveSchema.safeParse({
      disputeId: formData.get("disputeId"),
      decision: formData.get("decision"),
      resolvedMinutes: formData.get("resolvedMinutes") || undefined,
      note: formData.get("note"),
      approveAfterResolve: formData.get("approveAfterResolve") || undefined,
    });
    if (!parsed.success) {
      return { ok: false, message: "Controleer de ingevulde velden." };
    }

    const result = await resolveDispute({
      disputeId: parsed.data.disputeId,
      principal,
      decision: parsed.data.decision as DisputeDecision,
      ...(parsed.data.resolvedMinutes !== undefined
        ? { resolvedMinutes: parsed.data.resolvedMinutes }
        : {}),
      note: parsed.data.note,
    });

    let extra = "";
    if (parsed.data.approveAfterResolve) {
      const { timesheetId } = await prisma.dispute.findUniqueOrThrow({
        where: { id: parsed.data.disputeId },
        select: { timesheetId: true },
      });
      const approval = await approveTimesheet({
        timesheetId,
        principal,
        correctedBillableMinutes: result.resolvedMinutes,
        correctionNote: parsed.data.note,
      });
      extra = ` Timesheet ${approval.status.toLowerCase()}, uitbetaling ${approval.payout.status.toLowerCase()}.`;
    }

    revalidatePath("/admin/disputes");
    return {
      ok: true,
      message: `Dispuut ${
        result.status === "RESOLVED_OVERRULED" ? "overruled" : "goedgekeurd"
      } op ${(result.resolvedMinutes / 60).toFixed(2)} uur.${extra}`,
    };
  } catch (err) {
    const { body } = toErrorBody(err);
    return { ok: false, message: body.error.message };
  }
}
