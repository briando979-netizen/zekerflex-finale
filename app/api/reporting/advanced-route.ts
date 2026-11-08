import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";
import {
  createReportFromTemplate,
  getAvailableTemplates,
  validateReportQuery,
} from "@/lib/reporting/designer";
import {
  createScheduledReport,
  executeScheduledReport,
  getOverdueSchedules,
} from "@/lib/reporting/scheduling";
import {
  createDashboard,
  getDashboard,
  updateDashboard,
  listDashboards,
  deleteDashboard,
  shareDashboard,
} from "@/lib/reporting/dashboard-builder";
import {
  exportReport,
  generateReportPdf,
  generateReportExcel,
  generateReportCsv,
} from "@/lib/reporting/export";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const action = request.nextUrl.searchParams.get("action");
    const reportId = request.nextUrl.searchParams.get("reportId");
    const dashboardId = request.nextUrl.searchParams.get("dashboardId");

    // Get user's tenant
    const membership = await prisma.membership.findFirst({
      where: { userId: principal.userId },
    });

    if (!membership) {
      throw AppError.notFound("Tenant not found");
    }

    const tenantId = membership.tenantId;

    switch (action) {
      case "templates":
        return NextResponse.json({
          templates: getAvailableTemplates(),
        });

      case "reports":
        return await listReports(tenantId);

      case "report":
        if (!reportId) throw AppError.validation("reportId required");
        return await getReportDetails(reportId, tenantId);

      case "dashboards":
        return await listDashboardsAction(tenantId, principal.userId);

      case "dashboard":
        if (!dashboardId) throw AppError.validation("dashboardId required");
        return await getDashboardAction(dashboardId, tenantId);

      case "schedules":
        return await listSchedules(tenantId);

      case "visualizations":
        return await listVisualizations(tenantId);

      default:
        throw AppError.validation(`Unknown action: ${action}`);
    }
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();
    const action = body.action;

    // Get user's tenant
    const membership = await prisma.membership.findFirst({
      where: { userId: principal.userId },
    });

    if (!membership) {
      throw AppError.notFound("Tenant not found");
    }

    const tenantId = membership.tenantId;

    switch (action) {
      case "create-report-from-template":
        return await createReportFromTemplateAction(
          tenantId,
          principal.userId,
          body
        );

      case "create-dashboard":
        return await createDashboardAction(tenantId, principal.userId, body);

      case "create-schedule":
        return await createScheduleAction(tenantId, principal.userId, body);

      case "export-report":
        return await exportReportAction(tenantId, principal.userId, body);

      case "execute-schedule":
        return await executeScheduleAction(body);

      case "share-dashboard":
        return await shareDashboardAction(tenantId, principal.userId, body);

      default:
        throw AppError.validation(`Unknown action: ${action}`);
    }
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();
    const dashboardId = request.nextUrl.searchParams.get("dashboardId");

    if (!dashboardId) {
      throw AppError.validation("dashboardId required");
    }

    // Verify ownership
    const dashboard = await prisma.dashboard.findUnique({
      where: { id: dashboardId },
    });

    if (!dashboard || dashboard.createdByUserId !== principal.userId) {
      throw AppError.forbidden("Not authorized to update this dashboard");
    }

    const updated = await updateDashboard(dashboardId, body);

    return NextResponse.json({ success: true, dashboard: updated });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const dashboardId = request.nextUrl.searchParams.get("dashboardId");

    if (!dashboardId) {
      throw AppError.validation("dashboardId required");
    }

    // Verify ownership
    const dashboard = await prisma.dashboard.findUnique({
      where: { id: dashboardId },
    });

    if (!dashboard || dashboard.createdByUserId !== principal.userId) {
      throw AppError.forbidden("Not authorized to delete this dashboard");
    }

    await deleteDashboard(dashboardId);

    return NextResponse.json({ success: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

// Helper functions
async function listReports(tenantId: string) {
  const reports = await prisma.customReport.findMany({
    where: { tenantId },
    include: { createdByUser: true },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ reports });
}

async function getReportDetails(reportId: string, tenantId: string) {
  const report = await prisma.customReport.findUnique({
    where: { id: reportId },
    include: { createdByUser: true },
  });

  if (!report || report.tenantId !== tenantId) {
    throw AppError.notFound("Report not found");
  }

  return NextResponse.json({ report });
}

async function listDashboardsAction(tenantId: string, userId: string) {
  const dashboards = await listDashboards(tenantId, userId);
  return NextResponse.json({ dashboards });
}

async function getDashboardAction(dashboardId: string, tenantId: string) {
  const dashboard = await getDashboard(dashboardId);

  if (!dashboard || dashboard.tenantId !== tenantId) {
    throw AppError.notFound("Dashboard not found");
  }

  return NextResponse.json({ dashboard });
}

async function listSchedules(tenantId: string) {
  const schedules = await prisma.reportSchedule?.findMany?.({
    where: { tenantId },
    include: { report: true, createdByUser: true },
    orderBy: { nextExecutedAt: "asc" },
  });

  return NextResponse.json({ schedules: schedules || [] });
}

async function listVisualizations(tenantId: string) {
  const visualizations = await prisma.visualization?.findMany?.({
    where: { tenantId },
    include: { createdByUser: true },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ visualizations: visualizations || [] });
}

async function createReportFromTemplateAction(
  tenantId: string,
  userId: string,
  body: any
) {
  const { templateKey, customName } = body;

  if (!templateKey) {
    throw AppError.validation("templateKey required");
  }

  const report = await createReportFromTemplate(
    tenantId,
    userId,
    templateKey,
    customName
  );

  return NextResponse.json({ success: true, report }, { status: 201 });
}

async function createDashboardAction(
  tenantId: string,
  userId: string,
  body: any
) {
  const dashboard = await createDashboard(tenantId, userId, body);

  return NextResponse.json({ success: true, dashboard }, { status: 201 });
}

async function createScheduleAction(
  tenantId: string,
  userId: string,
  body: any
) {
  const { reportId, schedule } = body;

  if (!reportId || !schedule) {
    throw AppError.validation("reportId and schedule required");
  }

  const scheduled = await createScheduledReport(
    tenantId,
    userId,
    reportId,
    schedule
  );

  return NextResponse.json({ success: true, schedule: scheduled }, { status: 201 });
}

async function exportReportAction(
  tenantId: string,
  userId: string,
  body: any
) {
  const { reportId, formats } = body;

  if (!reportId) {
    throw AppError.validation("reportId required");
  }

  // Verify report belongs to tenant
  const report = await prisma.customReport.findUnique({
    where: { id: reportId },
  });

  if (!report || report.tenantId !== tenantId) {
    throw AppError.notFound("Report not found");
  }

  const files = await exportReport(reportId, formats || ["pdf"]);

  return NextResponse.json({ success: true, files });
}

async function executeScheduleAction(body: any) {
  const { scheduleId } = body;

  if (!scheduleId) {
    throw AppError.validation("scheduleId required");
  }

  const result = await executeScheduledReport(scheduleId);

  return NextResponse.json({
    success: result.success,
    message: result.message,
  });
}

async function shareDashboardAction(
  tenantId: string,
  userId: string,
  body: any
) {
  const { dashboardId, userIds, canEdit } = body;

  if (!dashboardId || !userIds) {
    throw AppError.validation("dashboardId and userIds required");
  }

  // Verify dashboard belongs to tenant and user can edit it
  const dashboard = await prisma.dashboard.findUnique({
    where: { id: dashboardId },
  });

  if (
    !dashboard ||
    dashboard.tenantId !== tenantId ||
    (dashboard.createdByUserId !== userId &&
      !dashboard.editors?.includes(userId))
  ) {
    throw AppError.forbidden("Not authorized to share this dashboard");
  }

  await shareDashboard(dashboardId, userIds, canEdit);

  return NextResponse.json({ success: true });
}
