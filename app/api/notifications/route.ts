import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const unreadOnly = request.nextUrl.searchParams.get("unreadOnly") === "true";

    const notifications = await prisma.notification.findMany({
      where: {
        userId: principal.userId,
        ...(unreadOnly && { read: false }),
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const grouped = notifications.reduce(
      (acc, notif) => {
        if (!acc[notif.type]) {
          acc[notif.type] = [];
        }
        acc[notif.type].push({
          id: notif.id,
          title: notif.title,
          body: notif.body,
          data: notif.data ? JSON.parse(notif.data) : {},
          read: notif.read,
          createdAt: notif.createdAt,
          readAt: notif.readAt,
        });
        return acc;
      },
      {} as Record<string, any[]>,
    );

    return NextResponse.json({
      notifications: grouped,
      total: notifications.length,
      unread: notifications.filter((n) => !n.read).length,
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const notificationId = request.nextUrl.searchParams.get("id");

    if (!notificationId) {
      throw AppError.validation("Notification ID required");
    }

    const body = await request.json();
    const { read } = body;

    const updated = await prisma.notification.update({
      where: { id: notificationId },
      data: {
        read,
        readAt: read ? new Date() : null,
      },
    });

    return NextResponse.json({
      notification: {
        id: updated.id,
        read: updated.read,
        readAt: updated.readAt,
      },
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const notificationId = request.nextUrl.searchParams.get("id");

    if (!notificationId) {
      throw AppError.validation("Notification ID required");
    }

    await prisma.notification.delete({
      where: { id: notificationId },
    });

    return NextResponse.json({ deleted: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
