import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { createDiscussion, listChannelDiscussions, searchDiscussions } from "@/lib/discussions/forum";
import { AppError, toErrorBody } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const principal = await requirePrincipal();
    const channelId = request.nextUrl.searchParams.get("channelId");
    const query = request.nextUrl.searchParams.get("q");

    if (!channelId) throw AppError.validation("channelId required");

    const discussions = query ? await searchDiscussions(channelId, query) : await listChannelDiscussions(channelId);
    return NextResponse.json({ discussions });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();
    const discussion = await createDiscussion(principal.userId, body);
    return NextResponse.json({ discussion }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
