import { type NextRequest, NextResponse } from "next/server";
import { getFunnelMetrics, getFunnelReport, identifyBottlenecks } from "@/lib/sales/funnel-tracking";
import { getAttributionReport } from "@/lib/sales/attribution";
import { getHotLeads, getStalledLeads } from "@/lib/sales/lead-scoring";
import { requireAuth, requireRole } from "@/lib/auth/server";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const session = await requireAuth(request);

    // Check role (SALES or PLATFORM_ADMIN)
    if (session.user.role !== "SALES" && session.user.role !== "PLATFORM_ADMIN") {
      return NextResponse.json(
        { error: "Onvoldoende rechten" },
        { status: 403 },
      );
    }

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const report = searchParams.get("report") ?? "summary";
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    let result: any = {};

    switch (report) {
      case "summary": {
        // Get basic funnel metrics
        const metrics = await getFunnelMetrics();
        result = {
          type: "summary",
          metrics,
          timestamp: new Date().toISOString(),
        };
        break;
      }

      case "detailed": {
        // Get detailed report with cohorts
        const detailed = await getFunnelReport();
        result = {
          type: "detailed",
          ...detailed,
        };
        break;
      }

      case "bottlenecks": {
        // Identify funnel bottlenecks
        const bottlenecks = await identifyBottlenecks();
        result = {
          type: "bottlenecks",
          issues: bottlenecks,
          timestamp: new Date().toISOString(),
        };
        break;
      }

      case "attribution": {
        // Get attribution report
        if (!startDate || !endDate) {
          return NextResponse.json(
            {
              error: "startDate en endDate zijn verplicht voor attribution report",
            },
            { status: 400 },
          );
        }

        const start = new Date(startDate);
        const end = new Date(endDate);

        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
          return NextResponse.json(
            { error: "Ongeldig datumformat" },
            { status: 400 },
          );
        }

        result = await getAttributionReport(start, end);
        break;
      }

      case "hot-leads": {
        // Get leads ready for sales
        const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 100);
        const leads = await getHotLeads(limit);
        result = {
          type: "hot_leads",
          count: leads.length,
          leads: leads.map((l) => ({
            id: l.leadCaptureId,
            score: l.totalScore,
            rating: l.qualificationRating,
          })),
        };
        break;
      }

      case "stalled-leads": {
        // Get leads that need re-engagement
        const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 200);
        const days = parseInt(searchParams.get("days") ?? "30");
        const leads = await getStalledLeads(limit);
        result = {
          type: "stalled_leads",
          count: leads.length,
          daysThreshold: days,
          leads: leads.slice(0, limit),
        };
        break;
      }

      default:
        return NextResponse.json(
          {
            error: "Onbekende report type",
            available: [
              "summary",
              "detailed",
              "bottlenecks",
              "attribution",
              "hot-leads",
              "stalled-leads",
            ],
          },
          { status: 400 },
        );
    }

    logger.info("Funnel report generated", {
      reportType: report,
      userId: session.user.id,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    logger.error("Failed to generate funnel report", { error });

    return NextResponse.json(
      { error: "Fout bij genereren funnel rapport" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await requireAuth(request);

    // Check role
    if (session.user.role !== "SALES" && session.user.role !== "PLATFORM_ADMIN") {
      return NextResponse.json(
        { error: "Onvoldoende rechten" },
        { status: 403 },
      );
    }

    const body = await request.json();

    // Validate request
    if (!body.action) {
      return NextResponse.json(
        { error: "action is verplicht" },
        { status: 400 },
      );
    }

    let result: any = {};

    switch (body.action) {
      case "get-metrics":
        result = await getFunnelMetrics();
        break;

      case "get-bottlenecks":
        result = await identifyBottlenecks();
        break;

      case "get-hot-leads":
        const hotLeads = await getHotLeads(body.limit ?? 20);
        result = { leads: hotLeads, count: hotLeads.length };
        break;

      default:
        return NextResponse.json(
          { error: "Onbekende action" },
          { status: 400 },
        );
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    logger.error("Failed to process funnel action", { error });

    return NextResponse.json(
      { error: "Fout bij verwerken request" },
      { status: 500 },
    );
  }
}
