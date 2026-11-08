import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { setUserStatus, getUserStatus, getOnlineUsers } from "@/lib/chat/status";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const { status } = await request.json();

    const updated = await setUserStatus(principal.userId, status);
    return NextResponse.json({ status: updated });
  } catch (err) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = request.nextUrl.searchParams.get("userId");

    if (userId) {
      const status = await getUserStatus(userId);
      return NextResponse.json({ status });
    }

    const online = await getOnlineUsers();
    return NextResponse.json({ onlineUsers: online });
  } catch (err) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
