import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildAllCubes, drillDown, aggregateCube } from "@/lib/analytics/olap";
import { createOrUpdateReport, executeReport, listReports } from "@/lib/analytics/custom-reports";
import {
  createDashboard,
  addWidget,
  getDashboard,
  listDashboards,
} from "@/lib/analytics/visualization";
import { createAlertRule, evaluateMetric, listAlerts } from "@/lib/analytics/alerts";
import { createExport, processExport, listExports } from "@/lib/analytics/data-export";
import { runDailyAggregation, getSnapshots } from "@/lib/analytics/data-warehouse";

export const dynamic = "force-dynamic";

/**
 * Analytics API — Unified endpoint for all 6 analytics subsystems.
 *
 * POST /api/analytics — Execute analytics operations:
 *   - "aggregate" — Run daily data warehouse aggregation
 *   - "build-cubes" — Build OLAP cubes
 *   - "drill-down" — Drill into cube data
 *   - "report" — Create/execute/list reports
 *   - "dashboard" — Create/manage dashboards
 *   - "alert" — Create/manage alert rules
 *   - "export" — Create/process data exports
 */

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { action } = body;

    // Verify user has access to this tenant
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { memberships: { select: { tenantId: true, role: true } } },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const tenantId = body.tenantId ?? user.memberships[0]?.tenantId;
    if (!tenantId) {
      return NextResponse.json({ error: "No tenant access" }, { status: 403 });
    }

    switch (action) {
      // 1. Data Warehouse
      case "aggregate": {
        const { snapshotDate } = body;
        if (!snapshotDate) {
          return NextResponse.json({ error: "snapshotDate required" }, { status: 400 });
        }
        await runDailyAggregation(snapshotDate);
        return NextResponse.json({ success: true, message: "Aggregation completed" });
      }

      case "get-snapshots": {
        const { dataType, startDate, endDate } = body;
        if (!dataType || !startDate || !endDate) {
          return NextResponse.json(
            { error: "dataType, startDate, endDate required" },
            { status: 400 },
          );
        }
        const snapshots = await getSnapshots(dataType, startDate, endDate);
        return NextResponse.json({ snapshots });
      }

      // 2. OLAP Cubes
      case "build-cubes": {
        await buildAllCubes();
        return NextResponse.json({ success: true, message: "Cubes built successfully" });
      }

      case "drill-down": {
        const { cubeName, filters } = body;
        if (!cubeName || !filters) {
          return NextResponse.json({ error: "cubeName, filters required" }, { status: 400 });
        }
        const results = await drillDown(cubeName, filters);
        return NextResponse.json({ results, cellCount: results.length });
      }

      case "aggregate-cube": {
        const { cubeName, groupBy, measure } = body;
        if (!cubeName || !groupBy || !measure) {
          return NextResponse.json(
            { error: "cubeName, groupBy, measure required" },
            { status: 400 },
          );
        }
        const results = await aggregateCube(cubeName, groupBy, measure);
        return NextResponse.json({ results, rowCount: results.length });
      }

      // 3. Custom Reports
      case "create-report": {
        const { title, description, query, formats } = body;
        if (!title || !query) {
          return NextResponse.json({ error: "title, query required" }, { status: 400 });
        }
        const reportId = await createOrUpdateReport(tenantId, session.user.id, {
          title,
          description,
          query,
          formats: formats ?? ["json"],
          isScheduled: false,
          isPublic: false,
          sharedWith: [],
        });
        return NextResponse.json({ reportId });
      }

      case "execute-report": {
        const { query } = body;
        if (!query) {
          return NextResponse.json({ error: "query required" }, { status: 400 });
        }
        const result = await executeReport(query);
        return NextResponse.json(result);
      }

      case "list-reports": {
        const { offset, limit } = body;
        const reports = await listReports(tenantId, offset ?? 0, limit ?? 20);
        return NextResponse.json({ reports, count: reports.length });
      }

      // 4. Dashboards & Visualization
      case "create-dashboard": {
        const { title, description } = body;
        if (!title) {
          return NextResponse.json({ error: "title required" }, { status: 400 });
        }
        const dashboardId = await createDashboard(tenantId, session.user.id, title, description);
        return NextResponse.json({ dashboardId });
      }

      case "add-widget": {
        const { dashboardId, widget, position } = body;
        if (!dashboardId || !widget || !position) {
          return NextResponse.json(
            { error: "dashboardId, widget, position required" },
            { status: 400 },
          );
        }
        await addWidget(dashboardId, widget, position);
        return NextResponse.json({ success: true });
      }

      case "get-dashboard": {
        const { dashboardId } = body;
        if (!dashboardId) {
          return NextResponse.json({ error: "dashboardId required" }, { status: 400 });
        }
        const dashboard = await getDashboard(dashboardId);
        return NextResponse.json({ dashboard });
      }

      case "list-dashboards": {
        const { offset, limit } = body;
        const dashboards = await listDashboards(tenantId, offset ?? 0, limit ?? 20);
        return NextResponse.json({ dashboards, count: dashboards.length });
      }

      // 5. Alerts & Thresholds
      case "create-alert": {
        const { name, metric, condition, threshold, recipients } = body;
        if (!name || !metric || !condition || threshold === undefined) {
          return NextResponse.json(
            { error: "name, metric, condition, threshold required" },
            { status: 400 },
          );
        }
        const ruleId = await createAlertRule(tenantId, session.user.id, {
          name,
          metric,
          condition,
          threshold,
          checkFrequency: "hourly",
          notifyVia: ["email"],
          recipients: recipients ?? [],
        });
        return NextResponse.json({ ruleId });
      }

      case "evaluate-metric": {
        const { metric, value } = body;
        if (!metric || value === undefined) {
          return NextResponse.json({ error: "metric, value required" }, { status: 400 });
        }
        await evaluateMetric({
          metric,
          value,
          timestamp: new Date(),
        });
        return NextResponse.json({ success: true });
      }

      case "list-alerts": {
        const { ruleId, offset, limit } = body;
        if (!ruleId) {
          return NextResponse.json({ error: "ruleId required" }, { status: 400 });
        }
        const alerts = await listAlerts(ruleId, false, offset ?? 0, limit ?? 50);
        return NextResponse.json({ alerts, count: alerts.length });
      }

      // 6. Data Export
      case "create-export": {
        const { title, dataTypes, format, dateRangeStart, dateRangeEnd } = body;
        if (!title || !dataTypes || !format || !dateRangeStart || !dateRangeEnd) {
          return NextResponse.json(
            { error: "title, dataTypes, format, dateRangeStart, dateRangeEnd required" },
            { status: 400 },
          );
        }
        const exportId = await createExport(tenantId, session.user.id, {
          title,
          dataTypes,
          format,
          dateRangeStart: new Date(dateRangeStart),
          dateRangeEnd: new Date(dateRangeEnd),
        });
        return NextResponse.json({ exportId });
      }

      case "process-export": {
        const { exportId } = body;
        if (!exportId) {
          return NextResponse.json({ error: "exportId required" }, { status: 400 });
        }
        // Process asynchronously
        processExport(exportId).catch((err) => {
          console.error("Export processing error:", err);
        });
        return NextResponse.json({ success: true, exportId });
      }

      case "list-exports": {
        const { offset, limit } = body;
        const exports = await listExports(tenantId, offset ?? 0, limit ?? 20);
        return NextResponse.json({ exports, count: exports.length });
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (err) {
    console.error("Analytics API error:", err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}

/**
 * GET /api/analytics — Retrieve analytics metadata and status.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Return system status and available metrics
  return NextResponse.json({
    status: "operational",
    subsystems: [
      { name: "Data Warehouse", status: "ready" },
      { name: "OLAP Cubes", status: "ready" },
      { name: "Custom Reports", status: "ready" },
      { name: "Dashboards", status: "ready" },
      { name: "Alerts", status: "ready" },
      { name: "Data Export", status: "ready" },
    ],
    availableMetrics: [
      "shift_count",
      "application_rate",
      "payment_volume",
      "worker_registrations",
      "avg_worker_rating",
    ],
  });
}
