import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { createMessage, listChannelMessages, searchMessages } from "@/lib/chat/team/messages";
import { AppError, toErrorBody } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const principal = await requirePrincipal();
    const channelId = request.nextUrl.searchParams.get("channelId");
    const limit = parseInt(request.nextUrl.searchParams.get("limit") || "50");
    const offset = parseInt(request.nextUrl.searchParams.get("offset") || "0");
    const query = request.nextUrl.searchParams.get("q");

    if (!channelId) throw AppError.validation("channelId required");

    const messages = query
      ? await searchMessages(channelId, query)
      : await listChannelMessages(channelId, limit, offset);

    return NextResponse.json({ messages });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();
    const message = await createMessage(principal.userId, body);
    return NextResponse.json({ message }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
