import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { annualSummaryPdf, getAnnualSummary } from "@/lib/worker/annual-summary";
import { currentYear } from "@/lib/worker/mileage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/me/jaaroverzicht?jaar=2025 — my year on one A4 (PDF) for the income-tax return. zzp/flex only.
export async function GET(request: Request): Promise<Response> {
  try {
    const p = await requirePrincipal();
    const asked = Number(new URL(request.url).searchParams.get("jaar"));
    const now = currentYear();
    const year = Number.isInteger(asked) && asked >= 2020 && asked <= now ? asked : now;

    const result = await getAnnualSummary(p.userId, year);
    if (result.kind === "no-profile") throw AppError.notFound("Je hebt nog geen profiel als professional");
    if (result.kind === "payroll") throw AppError.forbidden("Als uitzendkracht krijg je een jaaropgave via je loonstroken, geen jaaroverzicht voor ondernemers");

    return new Response(new Uint8Array(annualSummaryPdf(result.summary)), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="zekerflex-jaaroverzicht-${year}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
