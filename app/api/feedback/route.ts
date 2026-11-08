import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import {
  submitFeedback,
  getFeedbackByTenant,
  getFeedbackStats,
} from "@/lib/feedback/collector";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { tenantId, type, message, email, userId, attachments } = body;

    if (!tenantId || !type || !message) {
      throw AppError.validation("tenantId, type, and message required");
    }

    const feedback = await submitFeedback(tenantId, {
      type,
      message,
      email,
      userId,
      attachments,
    });

    return NextResponse.json({ feedback }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const tenantId = request.nextUrl.searchParams.get("tenantId");
    const status = request.nextUrl.searchParams.get("status");

    if (!tenantId) {
      throw AppError.validation("tenantId required");
    }

    const feedback = await getFeedbackByTenant(tenantId, status);
    const stats = await getFeedbackStats(tenantId);

    return NextResponse.json({ feedback, stats });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
