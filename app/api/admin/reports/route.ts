import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { z } from "zod";
import {
  generateExecutiveReport,
  saveExecutiveReport,
} from "@/lib/reports/executive";
import { createScheduledReport, getScheduledReports } from "@/lib/reports/scheduler";
import { exportData, ExportFormat } from "@/lib/reports/export";
import {
  detectAnomalies,
  generateRecommendations,
  compareMetrics,
} from "@/lib/reports/insights";

export const dynamic = "force-dynamic";

const GenerateReportSchema = z.object({
  period: z.enum(["daily", "weekly", "monthly", "quarterly", "yearly"]),
  save: z.boolean().optional(),
});

const ScheduleReportSchema = z.object({
  name: z.string(),
  reportType: z.enum(["executive", "detailed", "custom"]),
  format: z.enum(["pdf", "email", "slack"]),
  schedule: z.enum(["daily", "weekly", "monthly", "quarterly"]),
  recipients: z.array(z.string().email()),
  slackChannel: z.string().optional(),
});

const ExportSchema = z.object({
  data: z.array(z.record(z.unknown())),
  format: z.enum(["csv", "excel", "pdf", "json"]),
  fileName: z.string(),
  includeBranding: z.boolean().optional(),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requireRole("PLATFORM_ADMIN");

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    if (type === "scheduled") {
      const reports = await getScheduledReports("global");
      return NextResponse.json({ reports });
    }

    return NextResponse.json({ message: "Use type=scheduled for reports" });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    await requireRole("PLATFORM_ADMIN");

    const body = await request.json();
    const action = new URL(request.url).searchParams.get("action");

    if (action === "generate") {
      const { period, save } = GenerateReportSchema.parse(body);
      const report = await generateExecutiveReport("global", period);

      if (save) {
        await saveExecutiveReport("global", report);
      }

      return NextResponse.json({ report });
    }

    if (action === "schedule") {
      const data = ScheduleReportSchema.parse(body);
      const report = await createScheduledReport("global", {
        ...data,
        isActive: true,
      });

      return NextResponse.json({ report }, { status: 201 });
    }

    if (action === "export") {
      const { data, format, fileName, includeBranding } = ExportSchema.parse(body);
      const buffer = await exportData(data, {
        format: format as ExportFormat,
        fileName,
        includeHeaders: true,
        includeBranding: includeBranding ?? false,
      });

      return new NextResponse(buffer, {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename="${fileName}"`,
        },
      });
    }

    if (action === "analyze") {
      const { data } = z
        .object({
          data: z.array(z.object({ date: z.string(), value: z.number() })),
        })
        .parse(body);

      const anomalies = detectAnomalies(data);
      const recommendations = generateRecommendations(
        { metric: data[data.length - 1].value },
        { metric: data[0].value }
      );

      return NextResponse.json({ anomalies, recommendations });
    }

    throw AppError.validation("Invalid action");
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
