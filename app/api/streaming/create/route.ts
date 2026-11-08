import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { createLiveStream } from "@/lib/streaming/live";
import { AppError, toErrorBody } from "@/lib/errors";
import { z } from "zod";

const createStreamSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();
    const { title, description } = createStreamSchema.parse(body);

    const stream = await createLiveStream(principal.userId, title, description || "");

    return NextResponse.json(stream, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
