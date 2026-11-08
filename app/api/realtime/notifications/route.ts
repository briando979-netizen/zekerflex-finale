import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { getNotifications, getUnreadCount, markRead } from "@/lib/realtime/notifications";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const principal = await requirePrincipal();
    const limit = Number(req.nextUrl.searchParams.get("limit") ?? 50);

    const notifications = getNotifications(principal.userId, limit);
    const unreadCount = getUnreadCount(principal.userId);

    return NextResponse.json({
      notifications,
      unreadCount,
      total: notifications.length,
    });
  } catch (err) {
    console.error("Notifications fetch error:", err);
    return NextResponse.json({ error: "Failed to fetch notifications" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const principal = await requirePrincipal();
    const body = await req.json();
    const { notificationId, read } = body;

    if (read) {
      markRead(principal.userId, notificationId);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Notification update error:", err);
    return NextResponse.json({ error: "Failed to update notification" }, { status: 500 });
  }
}
