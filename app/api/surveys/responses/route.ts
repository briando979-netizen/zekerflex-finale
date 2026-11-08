import { NextRequest, NextResponse } from "next/server";
import { AppError, toErrorBody } from "@/lib/errors";
import { submitResponse, getResponses, getResponseStats } from "@/lib/surveys/responses";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { surveyId, answers, email, userId, npsScore } = body;

    if (!surveyId || !answers) {
      throw AppError.validation("surveyId and answers required");
    }

    const response = await submitResponse(surveyId, {
      answers,
      email,
      userId,
      npsScore,
    });

    return NextResponse.json({ response }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const surveyId = request.nextUrl.searchParams.get("surveyId");
    const limit = Number(request.nextUrl.searchParams.get("limit") || "50");
    const offset = Number(request.nextUrl.searchParams.get("offset") || "0");

    if (!surveyId) {
      throw AppError.validation("surveyId required");
    }

    const { responses, total } = await getResponses(surveyId, limit, offset);
    const stats = await getResponseStats(surveyId);

    return NextResponse.json({ responses, total, stats });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
