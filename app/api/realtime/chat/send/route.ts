import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { sendMessage } from "@/lib/chat/realtime";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const principal = await requirePrincipal();
    const body = await req.json();

    const { threadId, content, type = "text" } = body;

    if (!threadId || !content) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const message = await sendMessage(threadId, principal.userId, content, type);

    return NextResponse.json({ message }, { status: 201 });
  } catch (err) {
    console.error("Send message error:", err);
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }
}
