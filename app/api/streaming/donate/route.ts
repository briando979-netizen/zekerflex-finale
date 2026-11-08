import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { processDonation } from "@/lib/streaming/monetization";
import { AppError, toErrorBody } from "@/lib/errors";
import { z } from "zod";

const donationSchema = z.object({
  streamId: z.string(),
  amount: z.number().min(1).max(10000),
  message: z.string().optional(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();
    const { streamId, amount, message } = donationSchema.parse(body);

    const donation = await processDonation(streamId, principal.userId, amount, message);

    return NextResponse.json(donation, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
