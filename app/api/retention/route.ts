import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import {
  assessChurnRisk,
  generateChurnReport,
  getCriticalRiskCustomers,
} from "@/lib/retention/churn-prediction";
import {
  createCampaign,
  scheduleCampaignSequence,
  getPendingCampaigns,
  generateCampaignReport,
} from "@/lib/retention/reengagement";
import {
  addPoints,
  getLoyaltySummary,
  generateLoyaltyReport,
} from "@/lib/retention/loyalty";
import {
  submitFeedback,
  calculateNPS,
  generateFeedbackReport,
} from "@/lib/retention/feedback";
import {
  createUpsellOffer,
  getCustomerOffers,
  generateUpsellReport,
} from "@/lib/retention/upsell";
import {
  updateMetrics,
  calculateCohortRetention,
  generateRetentionReport,
  getAtRiskCustomers,
} from "@/lib/retention/metrics";

export const dynamic = "force-dynamic";

/**
 * GET /api/retention — retrieve retention data for authenticated customer
 *
 * Query params:
 * - subsystem: "churn" | "campaign" | "loyalty" | "feedback" | "upsell" | "metrics"
 * - action: specific action within subsystem
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const subsystem = request.nextUrl.searchParams.get("subsystem") || "metrics";
    const action = request.nextUrl.searchParams.get("action") || "summary";

    switch (subsystem) {
      case "churn": {
        if (action === "report") {
          const report = await generateChurnReport();
          return NextResponse.json({ report });
        }
        const critical = await getCriticalRiskCustomers(10);
        return NextResponse.json({ critical_customers: critical });
      }

      case "loyalty": {
        if (action === "summary") {
          const summary = await getLoyaltySummary(principal.tenantId);
          return NextResponse.json({ loyalty_summary: summary });
        }
        const report = await generateLoyaltyReport();
        return NextResponse.json({ report });
      }

      case "feedback": {
        if (action === "nps") {
          const nps = await calculateNPS();
          return NextResponse.json({ nps_data: nps });
        }
        const report = await generateFeedbackReport();
        return NextResponse.json({ report });
      }

      case "upsell": {
        if (action === "offers") {
          const offers = await getCustomerOffers(principal.tenantId, 5);
          return NextResponse.json({ active_offers: offers });
        }
        const report = await generateUpsellReport();
        return NextResponse.json({ report });
      }

      case "metrics":
      default: {
        const report = await generateRetentionReport();
        return NextResponse.json({ retention_report: report });
      }
    }
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

/**
 * POST /api/retention — record retention event or action
 *
 * Body:
 * {
 *   subsystem: "churn" | "campaign" | "loyalty" | "feedback" | "upsell" | "metrics",
 *   action: string,
 *   data: { ... }
 * }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();

    const { subsystem, action, data } = body;

    if (!subsystem || !action || !data) {
      throw AppError.validation("subsystem, action, and data zijn verplicht.");
    }

    switch (subsystem) {
      case "churn": {
        if (action === "assess") {
          const risk = await assessChurnRisk({
            customerId: principal.tenantId,
            ...data,
          });
          return NextResponse.json({ risk }, { status: 201 });
        }
        break;
      }

      case "campaign": {
        if (action === "create") {
          const campaign = await createCampaign({
            customerId: principal.tenantId,
            ...data,
          });
          return NextResponse.json({ campaign }, { status: 201 });
        }
        if (action === "schedule_sequence") {
          const campaigns = await scheduleCampaignSequence(
            principal.tenantId,
            data.type,
            data.message,
            data.incentive,
          );
          return NextResponse.json({ campaigns }, { status: 201 });
        }
        break;
      }

      case "loyalty": {
        if (action === "add_points") {
          const loyalty = await addPoints({
            customerId: principal.tenantId,
            points: data.points,
            activity: data.activity,
            transactionId: data.transactionId,
          });
          return NextResponse.json({ loyalty }, { status: 201 });
        }
        break;
      }

      case "feedback": {
        if (action === "submit") {
          const feedback = await submitFeedback({
            customerId: principal.tenantId,
            feedbackType: data.feedbackType,
            npsScore: data.npsScore,
            message: data.message,
            category: data.category,
            source: data.source || "in_app",
          });
          return NextResponse.json({ feedback }, { status: 201 });
        }
        break;
      }

      case "upsell": {
        if (action === "create_offer") {
          const offer = await createUpsellOffer({
            customerId: principal.tenantId,
            ...data,
          });
          return NextResponse.json({ offer }, { status: 201 });
        }
        break;
      }

      case "metrics": {
        if (action === "update") {
          const metrics = await updateMetrics(principal.tenantId, {
            customerId: principal.tenantId,
            ...data,
          });
          return NextResponse.json({ metrics }, { status: 200 });
        }
        if (action === "cohort_retention") {
          const retention = await calculateCohortRetention(data.cohortMonth);
          return NextResponse.json({ retention });
        }
        break;
      }

      default:
        throw AppError.validation(`Onbekend subsysteem: ${subsystem}`);
    }

    throw AppError.validation(`Onbekende actie: ${action} voor ${subsystem}`);
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

/**
 * Internal admin endpoint for bulk operations
 */
export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    // Require admin access
    const principal = await requirePrincipal();

    // Check for admin role (implement based on your auth system)
    if (principal.role !== "PLATFORM_ADMIN") {
      throw AppError.forbidden("Alleen beheerders kunnen bulkbewerkingen uitvoeren.");
    }

    const body = await request.json();
    const { action, params } = body;

    switch (action) {
      case "pending_campaigns": {
        const campaigns = await getPendingCampaigns(params?.limit ?? 100);
        return NextResponse.json({ count: campaigns.length, campaigns });
      }

      case "at_risk_customers": {
        const atRisk = await getAtRiskCustomers(params?.limit ?? 50);
        return NextResponse.json({ count: atRisk.length, at_risk: atRisk });
      }

      default:
        throw AppError.validation(`Onbekende bulkactie: ${action}`);
    }
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
