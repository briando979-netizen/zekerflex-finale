import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { pinMessage, unpinMessage, getPinnedMessages } from "@/lib/chat/pinning";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const { messageId, conversationId } = await request.json();

    const pinned = await pinMessage(messageId, conversationId);
    return NextResponse.json({ pinned }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const messageId = request.nextUrl.searchParams.get("messageId");
    await unpinMessage(messageId || "");
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const conversationId = request.nextUrl.searchParams.get("conversationId");
    const pinned = await getPinnedMessages(conversationId || "");
    return NextResponse.json({ pinned });
  } catch (err) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
