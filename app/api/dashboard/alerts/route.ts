import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const freelancer = await prisma.freelancerProfile.findUnique({
      where: { userId: principal.userId },
    });

    if (!freelancer) {
      throw AppError.notFound("Freelancer not found");
    }

    const unreadCount = await prisma.notification.count({
      where: {
        userId: principal.userId,
        readAt: null,
      },
    });

    const alerts = [
      {
        id: "pending-approvals",
        type: "info",
        message: "You have pending timesheet approvals",
        count: 0,
      },
      {
        id: "new-shifts",
        type: "success",
        message: "New shifts available in your area",
        count: 0,
      },
      {
        id: "expiring-documents",
        type: "warning",
        message: "Some documents are expiring soon",
        count: 0,
      },
    ];

    return NextResponse.json({
      unreadNotifications: unreadCount,
      alerts: alerts.filter((a) => a.count > 0 || true),
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
