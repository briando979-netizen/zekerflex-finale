import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { addReaction, removeReaction, getReactions } from "@/lib/chat/reactions";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const { messageId, emoji } = await request.json();

    const reaction = await addReaction(messageId, principal.userId, emoji);
    return NextResponse.json({ reaction }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const { messageId, emoji } = await request.json();

    await removeReaction(messageId, principal.userId, emoji);
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const messageId = request.nextUrl.searchParams.get("messageId");
    const reactions = await getReactions(messageId || "");
    return NextResponse.json({ reactions });
  } catch (err) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
