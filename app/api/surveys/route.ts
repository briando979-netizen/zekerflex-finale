import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { createSurvey, getSurveysByTenant } from "@/lib/surveys/builder";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const tenantId = request.nextUrl.searchParams.get("tenantId");

    if (!tenantId) {
      throw AppError.validation("tenantId required");
    }

    const surveys = await getSurveysByTenant(tenantId);
    return NextResponse.json({ surveys });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();
    const { tenantId, title, description, type, questions } = body;

    if (!tenantId || !title) {
      throw AppError.validation("tenantId and title required");
    }

    const survey = await createSurvey(tenantId, {
      title,
      description,
      type,
      questions,
    });

    return NextResponse.json({ survey }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
