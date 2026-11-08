import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { KPITracker } from "@/lib/admin/analytics/kpi-tracker";
import { RevenueMetricsAnalyzer } from "@/lib/admin/analytics/revenue-metrics";
import { FunnelAnalyzer } from "@/lib/admin/analytics/funnel-analyzer";
import { UserAnalyticsEngine } from "@/lib/admin/analytics/user-analytics";
import { PaymentAnalyticsEngine } from "@/lib/admin/analytics/payment-analytics";
import { TrendAnalyzer } from "@/lib/admin/analytics/trends";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireRole("PLATFORM_ADMIN");

    const section = request.nextUrl.searchParams.get("section") || "overview";

    const kpiTracker = new KPITracker();
    const revenueAnalyzer = new RevenueMetricsAnalyzer();
    const funnelAnalyzer = new FunnelAnalyzer();
    const userAnalytics = new UserAnalyticsEngine();
    const paymentAnalytics = new PaymentAnalyticsEngine();
    const trendAnalyzer = new TrendAnalyzer();

    // Fetch all data in parallel
    const [realTimeKpis, revenueMetrics, employerFunnel, freelancerFunnel, userMetrics, paymentMetrics, growthMetrics, anomalies] = await Promise.all([
      kpiTracker.getRealTimeKPIs(),
      revenueAnalyzer.getRevenueMetrics(),
      funnelAnalyzer.getEmployerFunnel(30),
      funnelAnalyzer.getFreelancerFunnel(30),
      userAnalytics.getUserMetrics(),
      paymentAnalytics.getPaymentMetrics(),
      trendAnalyzer.getGrowthMetrics("revenue"),
      trendAnalyzer.detectAnomalies(),
    ]);

    if (section === "overview") {
      return NextResponse.json({
        kpis: {
          activeShifts: realTimeKpis.activeShifts,
          activeApplications: realTimeKpis.activeApplications,
          payoutsToday: realTimeKpis.totalPayoutsToday,
          revenueToday: realTimeKpis.totalRevenueToday,
          activeUsers: realTimeKpis.activeUsers,
        },
        revenue: {
          mrr: revenueMetrics.mrr,
          arr: revenueMetrics.arr,
          platformFeeRevenue: revenueMetrics.platformFeeRevenue,
          payoutExpenses: revenueMetrics.payoutExpenses,
          grossMargin: revenueMetrics.grossMargin,
        },
        growth: growthMetrics,
        anomalies,
        timestamp: new Date().toISOString(),
      });
    }

    if (section === "revenue") {
      const dailyData = await revenueAnalyzer.getDailyRevenueData(
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        new Date()
      );
      const breakdown = await revenueAnalyzer.getPlatformFeeBreakdown();

      return NextResponse.json({
        metrics: revenueMetrics,
        dailyData,
        breakdown,
        growth: growthMetrics,
      });
    }

    if (section === "funnels") {
      const dropoffAnalysis = await funnelAnalyzer.getDropoffAnalysis();
      const stageInsights = await funnelAnalyzer.getStageInsights();

      return NextResponse.json({
        employerFunnel,
        freelancerFunnel,
        dropoffAnalysis,
        stageInsights,
      });
    }

    if (section === "users") {
      const segments = await userAnalytics.getSegmentedMetrics();
      const cohorts = await userAnalytics.getRetentionCohorts();
      const churn = await userAnalytics.getChurnAnalysis();

      return NextResponse.json({
        metrics: userMetrics,
        segments,
        cohorts,
        churnAnalysis: churn,
      });
    }

    if (section === "payments") {
      const failures = await paymentAnalytics.getPaymentFailures();
      const fraudSignals = await paymentAnalytics.detectFraudSignals();
      const distribution = await paymentAnalytics.getPaymentDistribution();
      const successTrend = await paymentAnalytics.getPaymentSuccessTrend();
      const routes = await paymentAnalytics.getPaymentRoutes();

      return NextResponse.json({
        metrics: paymentMetrics,
        failures,
        fraudSignals,
        distribution,
        successTrend,
        routes,
      });
    }

    if (section === "trends") {
      const forecasts = await trendAnalyzer.generateForecasts();

      return NextResponse.json({
        growth: growthMetrics,
        anomalies,
        forecasts,
      });
    }

    // Default: full dashboard
    const allData = {
      kpis: realTimeKpis,
      revenue: revenueMetrics,
      employerFunnel,
      freelancerFunnel,
      users: userMetrics,
      payments: paymentMetrics,
      growth: growthMetrics,
      anomalies,
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(allData);
  } catch (error) {
    console.error("Analytics dashboard error:", error);
    return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 });
  }
}
