import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import {
  calculateHealthScore,
  getHealthStatus,
  getAtRiskTenants,
} from "@/lib/customer-success/health";
import {
  recordFeatureUsage,
  recordMilestone,
  getEngagementSummary,
  getLowestEngagementTenants,
} from "@/lib/customer-success/engagement";
import {
  createPlaybook,
  listPlaybooksByType,
  startPlaybookInstance,
  getTenantPlaybookInstances,
} from "@/lib/customer-success/playbooks";
import {
  createQBRSession,
  getTenantQBRSessions,
  completeQBRSession,
  buildQBRMetricsDashboard,
} from "@/lib/customer-success/qbr";
import {
  assessCustomerRisk,
  getRiskAssessment,
  getHighRiskCustomers,
  checkRedFlags,
  generateRiskReport,
} from "@/lib/customer-success/risk";
import {
  createRenewalOpportunity,
  getRenewalOpportunity,
  proposeRenewal,
  negotiateRenewal,
  confirmRenewal,
  getUpcomingRenewals,
  getRenewalSummary,
  identifyUpsellOpportunities,
} from "@/lib/customer-success/renewal";

export const dynamic = "force-dynamic";

/**
 * GET /api/customer-success
 * Get CS dashboard summary or specific data based on query params
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const action = request.nextUrl.searchParams.get("action") || "dashboard";
    const tenantId = request.nextUrl.searchParams.get("tenantId") || principal.tenantId;

    switch (action) {
      case "health-status":
        return NextResponse.json(await getHealthStatus(tenantId));

      case "health-at-risk":
        return NextResponse.json({ tenants: await getAtRiskTenants(50) });

      case "engagement-summary":
        return NextResponse.json(await getEngagementSummary(tenantId));

      case "engagement-low":
        return NextResponse.json({ tenants: await getLowestEngagementTenants(20) });

      case "playbook-instances":
        const status = request.nextUrl.searchParams.get("status");
        return NextResponse.json(
          await getTenantPlaybookInstances(tenantId, status ?? undefined),
        );

      case "qbr-sessions":
        return NextResponse.json(await getTenantQBRSessions(tenantId));

      case "qbr-dashboard":
        return NextResponse.json(await buildQBRMetricsDashboard(tenantId));

      case "risk-assessment":
        return NextResponse.json(await getRiskAssessment(tenantId));

      case "risk-high":
        return NextResponse.json({ customers: await getHighRiskCustomers(50) });

      case "risk-report":
        return NextResponse.json(await generateRiskReport());

      case "renewal-opportunity":
        return NextResponse.json(await getRenewalOpportunity(tenantId));

      case "renewal-upcoming":
        const days = parseInt(request.nextUrl.searchParams.get("days") || "90");
        return NextResponse.json({ renewals: await getUpcomingRenewals(days) });

      case "renewal-summary":
        return NextResponse.json(await getRenewalSummary());

      default:
        // Dashboard summary
        const [health, engagement, risk, renewal] = await Promise.all([
          getHealthStatus(tenantId),
          getEngagementSummary(tenantId),
          getRiskAssessment(tenantId),
          getRenewalOpportunity(tenantId),
        ]);

        return NextResponse.json({
          health,
          engagement,
          risk,
          renewal,
        });
    }
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

/**
 * POST /api/customer-success
 * Create or update CS resources
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const { action, ...payload } = await request.json();

    if (!action) {
      throw AppError.validation("Action parameter required.");
    }

    switch (action) {
      case "calculate-health": {
        const score = await calculateHealthScore(principal.tenantId, payload);
        return NextResponse.json(score, { status: 201 });
      }

      case "record-feature-usage": {
        const { featureName } = payload;
        if (!featureName) throw AppError.validation("Feature name required.");
        const engagement = await recordFeatureUsage(principal.tenantId, featureName);
        return NextResponse.json(engagement, { status: 201 });
      }

      case "record-milestone": {
        const { milestone } = payload;
        if (!milestone) throw AppError.validation("Milestone required.");
        const engagement = await recordMilestone(principal.tenantId, milestone);
        return NextResponse.json(engagement, { status: 201 });
      }

      case "create-playbook": {
        const playbook = await createPlaybook(payload, principal.userId);
        return NextResponse.json(playbook, { status: 201 });
      }

      case "list-playbooks": {
        const { type } = payload;
        if (!type) throw AppError.validation("Playbook type required.");
        const playbooks = await listPlaybooksByType(type);
        return NextResponse.json({ playbooks }, { status: 200 });
      }

      case "start-playbook": {
        const { playbookId } = payload;
        if (!playbookId) throw AppError.validation("Playbook ID required.");
        const instance = await startPlaybookInstance(playbookId, principal.tenantId);
        return NextResponse.json(instance, { status: 201 });
      }

      case "create-qbr": {
        const qbr = await createQBRSession({
          tenantId: principal.tenantId,
          ...payload,
        });
        return NextResponse.json(qbr, { status: 201 });
      }

      case "complete-qbr": {
        const { qbrId, ...input } = payload;
        if (!qbrId) throw AppError.validation("QBR ID required.");
        const qbr = await completeQBRSession(qbrId, input);
        return NextResponse.json(qbr, { status: 200 });
      }

      case "assess-risk": {
        const assessment = await assessCustomerRisk({
          tenantId: principal.tenantId,
          ...payload,
        });
        return NextResponse.json(assessment, { status: 201 });
      }

      case "check-red-flags": {
        const flags = await checkRedFlags(principal.tenantId);
        return NextResponse.json(flags, { status: 200 });
      }

      case "create-renewal": {
        const opportunity = await createRenewalOpportunity({
          tenantId: principal.tenantId,
          ...payload,
        });
        return NextResponse.json(opportunity, { status: 201 });
      }

      case "propose-renewal": {
        const opportunity = await proposeRenewal(principal.tenantId, payload);
        return NextResponse.json(opportunity, { status: 200 });
      }

      case "negotiate-renewal": {
        const opportunity = await negotiateRenewal(principal.tenantId, payload);
        return NextResponse.json(opportunity, { status: 200 });
      }

      case "confirm-renewal": {
        const opportunity = await confirmRenewal(principal.tenantId);
        return NextResponse.json(opportunity, { status: 200 });
      }

      case "identify-upsell": {
        const { currentUsage } = payload;
        const opportunities = identifyUpsellOpportunities(currentUsage);
        return NextResponse.json(opportunities, { status: 200 });
      }

      default:
        throw AppError.validation(`Unknown action: ${action}`);
    }
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
