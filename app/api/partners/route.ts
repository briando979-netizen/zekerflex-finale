// ---------------------------------------------------------------------------
// Partners API — Production Partner & Affiliate Management endpoints
// Integrates all 6 subsystems: directory, commissions, attribution, payouts, performance, portal
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server';
import { requirePrincipal, requireRole } from '@/lib/auth';
import { AppError, toErrorBody } from '@/lib/errors';
import * as directory from '@/lib/partners/directory';
import * as commissions from '@/lib/partners/commissions';
import * as attribution from '@/lib/partners/attribution';
import * as payouts from '@/lib/partners/payouts';
import * as performance from '@/lib/partners/performance';
import * as portal from '@/lib/partners/portal';

export const dynamic = 'force-dynamic';

/**
 * GET /api/partners
 * List all partners or get specific partner data
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get('action');
    const partnerId = searchParams.get('id');

    // Partner dashboard
    if (action === 'dashboard' && partnerId) {
      const profile = await directory.getPartnerProfile(partnerId);
      const stats = await directory.getPartnerStats(partnerId);
      const kpi = await performance.calculateAffiliateKPI(partnerId);

      return NextResponse.json({
        profile,
        stats,
        kpi,
      });
    }

    // Partner portal
    if (action === 'portal' && partnerId) {
      const dashboardData = await portal.getPortalDashboard(partnerId);
      const resources = await portal.getPartnerResources();
      const notifications = await portal.getPartnerNotifications(partnerId);
      const faq = await portal.getPartnerFAQ();

      return NextResponse.json({
        dashboard: dashboardData,
        resources,
        notifications,
        faq,
      });
    }

    // Leaderboard
    if (action === 'leaderboard') {
      const limit = parseInt(searchParams.get('limit') || '10');
      const metric = (searchParams.get('metric') as any) || 'commissions';
      const leaderboard = await performance.getLeaderboard({ metric, limit });

      return NextResponse.json({ leaderboard });
    }

    // Performance report
    if (action === 'performance' && partnerId) {
      const report = await performance.generatePerformanceReport(partnerId);
      return NextResponse.json({ report });
    }

    // List all partners (admin)
    await requireRole('PLATFORM_ADMIN');

    const type = searchParams.get('type') as any;
    const tier = searchParams.get('tier') as any;
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const result = await directory.listPartners({
      type: type || undefined,
      tier: tier || undefined,
      status: status || undefined,
      limit,
      offset,
    });

    return NextResponse.json(result);
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

/**
 * POST /api/partners
 * Create partner or perform partner actions
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();
    const action = body.action;

    // Onboard new partner
    if (action === 'onboard') {
      const partner = await directory.onboardPartner(body);
      return NextResponse.json({ partner }, { status: 201 });
    }

    // Update partner profile
    if (action === 'update-profile' && body.partnerId) {
      const updated = await directory.updatePartnerProfile(body.partnerId, body.updates);
      return NextResponse.json({ partner: updated });
    }

    // Upgrade tier
    if (action === 'upgrade-tier' && body.partnerId) {
      await requireRole('PLATFORM_ADMIN');
      const updated = await directory.upgradePartnerTier(body.partnerId, body.newTier);
      return NextResponse.json({ partner: updated });
    }

    // Suspend partner
    if (action === 'suspend' && body.partnerId) {
      await requireRole('PLATFORM_ADMIN');
      const updated = await directory.suspendPartner(body.partnerId, body.reason);
      return NextResponse.json({ partner: updated });
    }

    // Reactivate partner
    if (action === 'reactivate' && body.partnerId) {
      await requireRole('PLATFORM_ADMIN');
      const updated = await directory.reactivatePartner(body.partnerId);
      return NextResponse.json({ partner: updated });
    }

    // Record commission
    if (action === 'record-commission' && body.affiliateId) {
      await requireRole('PLATFORM_ADMIN');
      const result = await commissions.recordCommission(
        body.affiliateId,
        body.trackingId,
        body.baseRevenueCents,
        body.rule
      );
      return NextResponse.json({ commission: result });
    }

    // Approve commissions
    if (action === 'approve-commissions' && body.affiliateId) {
      await requireRole('PLATFORM_ADMIN');
      const result = await commissions.approveCommissions(body.affiliateId, body.commissionIds);
      return NextResponse.json({ result });
    }

    // Generate referral link
    if (action === 'generate-referral-link' && body.affiliateId) {
      const link = await attribution.generateReferralLink(body.affiliateId, body.options);
      return NextResponse.json({ link });
    }

    // Track referral click
    if (action === 'track-click' && body.code) {
      const tracking = await attribution.trackReferralClick(
        body.code,
        body.userId,
        body.attribution,
        body.deviceId
      );
      return NextResponse.json({ tracking });
    }

    // Record conversion
    if (action === 'record-conversion' && body.trackingCode) {
      const result = await attribution.recordConversion(body.trackingCode, body.conversionValueCents, body.userId);
      return NextResponse.json({ conversion: result });
    }

    // Create payout
    if (action === 'create-payout' && body.affiliateId) {
      await requireRole('PLATFORM_ADMIN');
      const payout = await payouts.createPayout(body.affiliateId, body.amountCents);
      return NextResponse.json({ payout });
    }

    // Process payout
    if (action === 'process-payout' && body.payoutId) {
      await requireRole('PLATFORM_ADMIN');
      const result = await payouts.processPayout(body.payoutId, body.transactionId);
      return NextResponse.json({ payout: result });
    }

    // Schedule batch payout
    if (action === 'batch-payout') {
      await requireRole('PLATFORM_ADMIN');
      const result = await payouts.scheduleBatchPayout(body.affiliateIds, body.minimumThresholdCents);
      return NextResponse.json({ result });
    }

    // Send support message
    if (action === 'send-support-message' && body.affiliateId) {
      const result = await portal.sendSupportMessage(body.affiliateId, body.subject, body.message);
      return NextResponse.json({ result });
    }

    // Generate sharing content
    if (action === 'sharing-content' && body.affiliateId) {
      const content = await portal.generateSharingContent(body.affiliateId);
      return NextResponse.json({ content });
    }

    throw new AppError.validation('Unknown action');
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

/**
 * PUT /api/partners
 * Update partner data
 */
export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    await requireRole('PLATFORM_ADMIN');

    const body = await request.json();
    const partnerId = body.id;

    if (!partnerId) {
      throw new AppError.validation('Partner ID required');
    }

    const updated = await directory.updatePartnerProfile(partnerId, body.updates);
    return NextResponse.json({ partner: updated });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

/**
 * DELETE /api/partners
 * Soft-delete or suspend a partner
 */
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    await requireRole('PLATFORM_ADMIN');

    const searchParams = request.nextUrl.searchParams;
    const partnerId = searchParams.get('id');

    if (!partnerId) {
      throw new AppError.validation('Partner ID required');
    }

    const suspended = await directory.suspendPartner(partnerId, 'Suspended by admin');
    return NextResponse.json({ partner: suspended });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
