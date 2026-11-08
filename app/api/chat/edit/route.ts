import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { editMessage, deleteMessage } from "@/lib/chat/editing";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const { messageId, content } = await request.json();

    const updated = await editMessage(messageId, content);
    return NextResponse.json({ message: updated });
  } catch (err) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const messageId = request.nextUrl.searchParams.get("messageId");
    await deleteMessage(messageId || "");
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
