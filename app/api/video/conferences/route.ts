import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { createConference, listChannelConferences } from "@/lib/video/conferencing";
import { AppError, toErrorBody } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const principal = await requirePrincipal();
    const channelId = request.nextUrl.searchParams.get("channelId");
    if (!channelId) throw AppError.validation("channelId required");
    const conferences = await listChannelConferences(channelId);
    return NextResponse.json({ conferences });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();
    const conference = await createConference(principal.userId, body);
    return NextResponse.json({ conference }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
