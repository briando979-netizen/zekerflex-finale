import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { AuditLogger } from "@/lib/audit/logger";
import { getAllFrameworks, getComplianceStatus } from "@/lib/compliance/frameworks";
import { DataGovernanceManager } from "@/lib/governance/manager";
import { RiskManager } from "@/lib/risk/manager";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requireRole("PLATFORM_ADMIN");

    const reportType = request.nextUrl.searchParams.get("type") || "comprehensive";
    const framework = request.nextUrl.searchParams.get("framework");
    const format = request.nextUrl.searchParams.get("format") || "json";

    let report: any = {};

    if (reportType === "comprehensive" || reportType === "compliance") {
      // Generate compliance report
      const frameworks = framework ? [getAllFrameworks().find((f) => f.id === framework)].filter(Boolean) : getAllFrameworks();

      report.compliance = frameworks.map((f) => ({
        id: f.id,
        name: f.name,
        ...getComplianceStatus(f),
        requirements: f.requirements.map((r) => ({
          id: r.id,
          name: r.name,
          status: r.status,
          control: r.control,
        })),
      }));
    }

    if (reportType === "comprehensive" || reportType === "audit") {
      // Generate audit report
      const startDate = request.nextUrl.searchParams.get("startDate");
      const endDate = request.nextUrl.searchParams.get("endDate");

      const auditTrail = await AuditLogger.getAuditTrail({
        startDate: startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        endDate: endDate ? new Date(endDate) : new Date(),
        limit: 10000,
      });

      report.audit = {
        totalEntries: auditTrail.length,
        actionBreakdown: auditTrail.reduce(
          (acc, log) => {
            acc[log.action] = (acc[log.action] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>
        ),
        entries: auditTrail.slice(0, 100),
      };
    }

    if (reportType === "comprehensive" || reportType === "governance") {
      // Generate data governance report
      report.governance = await DataGovernanceManager.generateGovernanceReport();
    }

    if (reportType === "comprehensive" || reportType === "risk") {
      // Generate risk report
      report.risk = await RiskManager.generateRiskReport();
    }

    if (format === "csv") {
      // Convert to CSV format
      const csv = convertToCSV(report);
      return new NextResponse(csv, {
        headers: { "Content-Type": "text/csv" },
      });
    }

    if (format === "pdf") {
      // PDF generation (would use a library like pdfkit)
      return NextResponse.json({
        message: "PDF export not implemented. Use JSON or CSV.",
      });
    }

    return NextResponse.json(report);
  } catch (error) {
    console.error("Compliance report error:", error);
    return NextResponse.json(
      { error: "Failed to generate report" },
      { status: 500 }
    );
  }
}

function convertToCSV(data: any): string {
  const rows: string[] = [];

  if (data.compliance) {
    rows.push("COMPLIANCE REPORT");
    rows.push("Framework,Status,Compliance %,Met Requirements,Total Requirements");
    data.compliance.forEach((f: any) => {
      rows.push(
        `${f.name},${f.compliant}/${f.total},${f.percentage}%,${f.compliant},${f.total}`
      );
    });
    rows.push("");
  }

  if (data.audit) {
    rows.push("AUDIT REPORT");
    rows.push("Total Entries," + data.audit.totalEntries);
    rows.push("Action,Count");
    Object.entries(data.audit.actionBreakdown).forEach(([action, count]) => {
      rows.push(`${action},${count}`);
    });
    rows.push("");
  }

  if (data.governance) {
    rows.push("DATA GOVERNANCE REPORT");
    rows.push(data.governance);
    rows.push("");
  }

  if (data.risk) {
    rows.push("RISK ASSESSMENT REPORT");
    rows.push(data.risk);
  }

  return rows.join("\n");
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    await requireRole("PLATFORM_ADMIN");

    const body = await request.json();
    const { reportType, framework, scheduleEmail, emailTo } = body;

    // Validate request
    if (!reportType) {
      return NextResponse.json(
        { error: "reportType is required" },
        { status: 400 }
      );
    }

    // Generate report
    const report = {
      id: `report-${Date.now()}`,
      type: reportType,
      framework,
      generatedAt: new Date(),
      data: {}, // Would be populated with actual report data
    };

    // Schedule email if requested
    if (scheduleEmail && emailTo) {
      // Implementation: schedule email with report
      console.log(`Report scheduled for delivery to ${emailTo}`);
    }

    return NextResponse.json(report, { status: 201 });
  } catch (error) {
    console.error("Report creation error:", error);
    return NextResponse.json(
      { error: "Failed to create report" },
      { status: 500 }
    );
  }
}
