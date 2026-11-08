import { NextRequest, NextResponse } from "next/server";
import { listActiveStreams } from "@/lib/streaming/manager";
import { AppError, toErrorBody } from "@/lib/errors";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const streams = await listActiveStreams();
    return NextResponse.json({ streams });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
