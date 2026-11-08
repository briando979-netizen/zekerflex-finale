import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { submitFormResponse, listFormResponses, getFormResponseStats, exportFormResponses } from "@/lib/forms/responses";
import { getForm } from "@/lib/forms/builder";
import { AppError, toErrorBody } from "@/lib/errors";
import { z } from "zod";

export const dynamic = "force-dynamic";

const SubmitResponseSchema = z.object({
  formId: z.string().min(1),
  data: z.record(z.unknown()),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();
    const { formId, data } = SubmitResponseSchema.parse(body);

    const form = await getForm(principal.tenantId, formId);

    const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";
    const userAgent = request.headers.get("user-agent") || undefined;

    const response = await submitFormResponse(principal.tenantId, formId, data, form.fields, {
      ip,
      userAgent,
    });

    return NextResponse.json({ response }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const formId = request.nextUrl.searchParams.get("formId");
    const format = request.nextUrl.searchParams.get("export") as "csv" | "json" | null;

    if (!formId) {
      throw AppError.validation("formId required");
    }

    if (format) {
      const csv = await exportFormResponses(principal.tenantId, formId, format);
      const contentType = format === "csv" ? "text/csv" : "application/json";
      return new NextResponse(csv, {
        headers: {
          "Content-Type": contentType,
          "Content-Disposition": `attachment; filename="responses.${format}"`,
        },
      });
    }

    const responses = await listFormResponses(principal.tenantId, formId);
    const stats = await getFormResponseStats(principal.tenantId, formId);

    return NextResponse.json({ responses, stats });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
