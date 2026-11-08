import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { uploadFile, listChannelFiles, searchFiles } from "@/lib/files/sharing";
import { AppError, toErrorBody } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const principal = await requirePrincipal();
    const channelId = request.nextUrl.searchParams.get("channelId");
    const query = request.nextUrl.searchParams.get("q");
    const folder = request.nextUrl.searchParams.get("folder");

    if (!channelId) throw AppError.validation("channelId required");

    const files = query ? await searchFiles(channelId, query) : await listChannelFiles(channelId, folder || "root");
    return NextResponse.json({ files });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();
    const file = await uploadFile(principal.userId, body);
    return NextResponse.json({ file }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
