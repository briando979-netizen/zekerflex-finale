import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { markAsRead, getUnreadCount, getReadStatus } from "@/lib/chat/read-receipts";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const { messageId } = await request.json();

    await markAsRead(messageId, principal.userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const messageId = request.nextUrl.searchParams.get("messageId");

    if (messageId) {
      const status = await getReadStatus(messageId);
      return NextResponse.json({ status });
    }

    const unread = await getUnreadCount(principal.userId);
    return NextResponse.json({ unreadCount: unread });
  } catch (err) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
