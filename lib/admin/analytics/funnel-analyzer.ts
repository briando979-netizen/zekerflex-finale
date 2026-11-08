import { prisma } from "@/lib/prisma";

export interface FunnelStage {
  name: string;
  value: number;
  conversionRate: number; // as percentage
  dropoffRate: number; // vs previous stage
}

export interface FunnelAnalysis {
  name: string;
  stages: FunnelStage[];
  totalEntrants: number;
  totalConverted: number;
  overallConversionRate: number;
}

/**
 * Analyze conversion funnels across the platform
 */
export class FunnelAnalyzer {
  /**
   * Employer signup to hire funnel
   */
  async getEmployerFunnel(days: number = 30): Promise<FunnelAnalysis> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    // Stage 1: Signups (users with employer role)
    const signups = await prisma.user.count({
      where: {
        role: "HQ_ADMIN",
        createdAt: { gte: since },
      },
    });

    // Stage 2: Profile completed (tenant with company details)
    const profilesCompleted = await prisma.tenant.count({
      where: {
        memberships: {
          some: {
            role: "HQ_ADMIN",
            user: {
              createdAt: { gte: since },
            },
          },
        },
        kvkNumber: { not: null },
      },
    });

    // Stage 3: Created first shift/listing
    const firstShift = await prisma.shift.findMany({
      where: {
        createdAt: { gte: since },
      },
      distinct: ["tenantId"],
      select: { tenantId: true },
    });
    const firstShiftCount = firstShift.length;

    // Stage 4: Hired someone (accepted assignment)
    const hired = await prisma.shiftAssignment.findMany({
      where: {
        status: "ACCEPTED",
        shift: {
          createdAt: { gte: since },
        },
      },
      distinct: ["shift", "shiftId"],
      select: {
        shift: {
          select: { tenantId: true },
        },
      },
    });

    const hiredSet = new Set(hired.map((h) => h.shift?.tenantId).filter(Boolean));
    const hiredCount = hiredSet.size;

    // Stage 5: Paid out a worker
    const paidOut = await prisma.invoice.findMany({
      where: {
        status: "PAID",
        createdAt: { gte: since },
        recipientTenantId: { not: null },
      },
      distinct: ["recipientTenantId"],
      select: { recipientTenantId: true },
    });

    const paidOutSet = new Set(paidOut.map((p) => p.recipientTenantId).filter(Boolean));
    const paidOutCount = paidOutSet.size;

    const stages: FunnelStage[] = [
      {
        name: "Signup",
        value: signups,
        conversionRate: 100,
        dropoffRate: 0,
      },
      {
        name: "Profile Complete",
        value: profilesCompleted,
        conversionRate: (profilesCompleted / signups) * 100,
        dropoffRate: ((signups - profilesCompleted) / signups) * 100,
      },
      {
        name: "First Shift Posted",
        value: firstShiftCount,
        conversionRate: (firstShiftCount / profilesCompleted) * 100,
        dropoffRate: ((profilesCompleted - firstShiftCount) / profilesCompleted) * 100,
      },
      {
        name: "First Hire",
        value: hiredCount,
        conversionRate: (hiredCount / firstShiftCount) * 100,
        dropoffRate: ((firstShiftCount - hiredCount) / firstShiftCount) * 100,
      },
      {
        name: "First Payment",
        value: paidOutCount,
        conversionRate: (paidOutCount / hiredCount) * 100,
        dropoffRate: ((hiredCount - paidOutCount) / hiredCount) * 100,
      },
    ];

    return {
      name: "Employer Funnel",
      stages,
      totalEntrants: signups,
      totalConverted: paidOutCount,
      overallConversionRate: (paidOutCount / signups) * 100,
    };
  }

  /**
   * Freelancer signup to first payment funnel
   */
  async getFreelancerFunnel(days: number = 30): Promise<FunnelAnalysis> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    // Stage 1: Signups
    const signups = await prisma.user.count({
      where: {
        role: "FREELANCER",
        createdAt: { gte: since },
      },
    });

    // Stage 2: Profile completed (KYC verified or has details)
    const profilesCompleted = await prisma.user.count({
      where: {
        role: "FREELANCER",
        createdAt: { gte: since },
        kycStatus: "VERIFIED",
      },
    });

    // Stage 3: Applied to shift
    const applied = await prisma.shiftAssignment.findMany({
      where: {
        createdAt: { gte: since },
      },
      distinct: ["userId"],
      select: { userId: true },
    });
    const appliedCount = applied.length;

    // Stage 4: Accepted shift
    const accepted = await prisma.shiftAssignment.count({
      where: {
        status: "ACCEPTED",
        createdAt: { gte: since },
      },
    });

    // Get distinct workers who were accepted
    const acceptedWorkers = await prisma.shiftAssignment.findMany({
      where: {
        status: "ACCEPTED",
        createdAt: { gte: since },
      },
      distinct: ["userId"],
      select: { userId: true },
    });
    const acceptedCount = acceptedWorkers.length;

    // Stage 5: Completed shift and got paid
    const paid = await prisma.payment.findMany({
      where: {
        status: "SETTLED",
        createdAt: { gte: since },
      },
      distinct: ["userId"],
      select: { userId: true },
    });
    const paidCount = paid.length;

    const stages: FunnelStage[] = [
      {
        name: "Signup",
        value: signups,
        conversionRate: 100,
        dropoffRate: 0,
      },
      {
        name: "Profile Complete",
        value: profilesCompleted,
        conversionRate: (profilesCompleted / signups) * 100,
        dropoffRate: ((signups - profilesCompleted) / signups) * 100,
      },
      {
        name: "Applied to Shift",
        value: appliedCount,
        conversionRate: (appliedCount / profilesCompleted) * 100,
        dropoffRate: ((profilesCompleted - appliedCount) / profilesCompleted) * 100,
      },
      {
        name: "Shift Accepted",
        value: acceptedCount,
        conversionRate: (acceptedCount / appliedCount) * 100,
        dropoffRate: ((appliedCount - acceptedCount) / appliedCount) * 100,
      },
      {
        name: "First Payment",
        value: paidCount,
        conversionRate: (paidCount / acceptedCount) * 100,
        dropoffRate: ((acceptedCount - paidCount) / acceptedCount) * 100,
      },
    ];

    return {
      name: "Freelancer Funnel",
      stages,
      totalEntrants: signups,
      totalConverted: paidCount,
      overallConversionRate: (paidCount / signups) * 100,
    };
  }

  /**
   * Get dropoff analysis: where users drop out of the funnel
   */
  async getDropoffAnalysis(): Promise<Array<{ stage: string; dropoffCount: number; reason: string }>> {
    // Analyze signup to KYC completion
    const signupsNoKyc = await prisma.user.count({
      where: {
        role: "FREELANCER",
        kycStatus: "NOT_STARTED",
      },
    });

    // Analyze KYC completion to first application
    const kycNoApplication = await prisma.user.count({
      where: {
        role: "FREELANCER",
        kycStatus: "VERIFIED",
        shiftAssignments: {
          none: {},
        },
      },
    });

    // Analyze applications to acceptance
    const appliedNotAccepted = await prisma.shiftAssignment.count({
      where: {
        status: { in: ["PENDING", "REJECTED"] },
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
    });

    return [
      {
        stage: "Signup to KYC",
        dropoffCount: signupsNoKyc,
        reason: "Never completed identity verification",
      },
      {
        stage: "KYC to First Application",
        dropoffCount: kycNoApplication,
        reason: "Verified but never applied to any shift",
      },
      {
        stage: "Application to Acceptance",
        dropoffCount: appliedNotAccepted,
        reason: "Application rejected or not responded to",
      },
    ];
  }

  /**
   * Calculate stage-specific insights
   */
  async getStageInsights(): Promise<
    Array<{
      stage: string;
      insights: string[];
      recommendations: string[];
    }>
  > {
    return [
      {
        stage: "Signup",
        insights: [
          "Track signup source (organic, paid ads, referral)",
          "Monitor signup-to-email verification rate",
        ],
        recommendations: ["Simplify signup flow", "Add referral incentives"],
      },
      {
        stage: "Profile Completion",
        insights: ["KYC verification time", "Document rejection rate"],
        recommendations: ["Speed up verification process", "Provide better KYC guidance"],
      },
      {
        stage: "First Activity",
        insights: ["Time to first application/listing", "Application success rate"],
        recommendations: ["Send onboarding nudges", "Suggest relevant opportunities"],
      },
      {
        stage: "Conversion",
        insights: ["Time from application to acceptance", "Payment settlement time"],
        recommendations: [
          "Improve matching algorithm",
          "Reduce payment processing time",
        ],
      },
    ];
  }
}
