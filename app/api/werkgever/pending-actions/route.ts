import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";

export const dynamic = "force-dynamic";

interface PendingAction {
  type: string;
  count: number;
  priority: "high" | "medium" | "low";
  link?: string;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const scope = await resolveEmployerScope(principal);
    const tenantId = scope.tenantIds[0];

    if (!tenantId) {
      throw AppError.precondition("Geen organisatie gekoppeld");
    }

    const actions: PendingAction[] = [];

    // Pending timesheet approvals
    const pendingTimesheets = await prisma.timesheet.count({
      where: {
        shiftAssignment: {
          shift: { branch: { tenantId } },
        },
        status: "SUBMITTED",
      },
    });

    if (pendingTimesheets > 0) {
      actions.push({
        type: "timesheets_pending",
        count: pendingTimesheets,
        priority: "high",
        link: "/werkgever/uren",
      });
    }

    // Team member invitations pending acceptance
    const pendingInvites = await prisma.teamInvite.count({
      where: {
        tenantId,
        acceptedAt: null,
      },
    });

    if (pendingInvites > 0) {
      actions.push({
        type: "team_invites_pending",
        count: pendingInvites,
        priority: "low",
        link: "/werkgever/team",
      });
    }

    // Shifts created but not published
    const draftShifts = await prisma.shift.count({
      where: {
        branch: { tenantId },
        status: "DRAFT",
      },
    });

    if (draftShifts > 0) {
      actions.push({
        type: "shifts_draft",
        count: draftShifts,
        priority: "medium",
        link: "/werkgever/diensten",
      });
    }

    return NextResponse.json({ actions });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
