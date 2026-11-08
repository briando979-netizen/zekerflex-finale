import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { generateProjectReport, getProjectReports } from "@/lib/projects/reporting";
import { AppError, toErrorBody } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const type = request.nextUrl.searchParams.get("type");

    const reports = await getProjectReports(params.id, type || undefined);
    return NextResponse.json({ reports });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const { type } = await request.json();

    if (type === "complete") {
      const report = await generateProjectReport(params.id);
      return NextResponse.json({ report }, { status: 201 });
    }

    throw AppError.validation("Invalid report type");
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
