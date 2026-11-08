import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import {
  createApprovalRoute,
  resolveApprovers,
  createSLA,
  createEscalation,
  notifyApprovers,
  logApproval,
} from "@/lib/workflows";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const principal = await requirePrincipal();
    const { workflowId, stepId, rules, context, responseTimeMinutes, resolutionTimeMinutes } = await request.json();

    // Create approval route
    const route = await createApprovalRoute({
      workflowId,
      stepId,
      rules,
      priority: 0,
    });

    // Resolve approvers based on context
    const approvers = await resolveApprovers([route], context || {});
    if (approvers.length === 0) {
      throw AppError.validation("No approvers resolved");
    }

    // Create SLA
    const sla = await createSLA(workflowId, `appr_${Date.now()}`, responseTimeMinutes || 60, resolutionTimeMinutes || 240);

    // Create escalation if needed
    const escalation = await createEscalation(
      sla.approvalId,
      1,
      120,
      [principal.userId],
      "Auto-escalation after 2 hours"
    );

    // Notify approvers
    await notifyApprovers(sla.approvalId, approvers, "You have a new approval request");

    // Log in audit trail
    await logApproval(workflowId, sla.approvalId, principal.userId, principal.role, principal.displayName || "System", "approved");

    return NextResponse.json({ approval: sla, approvers, escalation }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const principal = await requirePrincipal();
    const { approvalId, decision, comment } = await request.json();

    // Log decision in audit trail
    await logApproval(
      "wf_unknown",
      approvalId,
      principal.userId,
      principal.role,
      principal.displayName || "System",
      decision,
      comment
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
