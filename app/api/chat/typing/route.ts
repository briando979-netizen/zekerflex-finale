import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { setTypingIndicator, clearTypingIndicator, getTypingUsers } from "@/lib/chat/typing";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const { conversationId, typing } = await request.json();

    if (typing) {
      await setTypingIndicator(principal.userId, conversationId);
    } else {
      await clearTypingIndicator(principal.userId, conversationId);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const conversationId = request.nextUrl.searchParams.get("conversationId");
    const typing = await getTypingUsers(conversationId || "");
    return NextResponse.json({ typing });
  } catch (err) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
