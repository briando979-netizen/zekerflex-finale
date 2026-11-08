import { requireRole } from "@/lib/auth";
import { MetricsEngine } from "@/lib/metrics/engine";
import { BIAnalysis } from "@/lib/bi/analysis";
import { TrendChart, KPITile, FunnelChart } from "@/components/analytics/AnalyticsCharts";
import Link from "next/link";

export const metadata = { title: "Analytics Dashboard | Admin" };

export default async function AnalyticsDashboard() {
  await requireRole("PLATFORM_ADMIN");

  const metricsEngine = new MetricsEngine();
  const biAnalysis = new BIAnalysis();

  const endDate = new Date();
  const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [revenue, users, conversions, funnel, retention, churn] = await Promise.all([
    metricsEngine.calculateRevenueKPIs(startDate, endDate),
    metricsEngine.calculateUserKPIs(startDate, endDate),
    metricsEngine.calculateConversionKPIs(startDate, endDate),
    biAnalysis.funnelAnalysis(["signup", "profile_complete", "first_shift", "payment_received"]),
    biAnalysis.retentionCurve(startDate),
    biAnalysis.churnAnalysis(30),
  ]);

  const funnelData = funnel.map((f) => ({
    stage: f.stage,
    users: f.users,
    conversionRate: f.conversionRate,
  }));

  const trendData = [
    { name: "Week 1", value: revenue.totalRevenue * 0.2 },
    { name: "Week 2", value: revenue.totalRevenue * 0.25 },
    { name: "Week 3", value: revenue.totalRevenue * 0.3 },
    { name: "Week 4", value: revenue.totalRevenue * 0.25 },
  ];

  return (
    <div className="space-y-8 p-8">
      <div>
        <h1 className="text-3xl font-bold">Analytics Dashboard</h1>
        <p className="text-gray-600 mt-2">Real-time metrics & business intelligence</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <KPITile label="Revenue (30d)" value={Math.round(revenue.totalRevenue)} trend={revenue.trend} target={5000} />
        <KPITile label="Active Users" value={users.activeUsers} target={1000} />
        <KPITile label="New Users" value={users.newUsers} target={200} />
        <KPITile label="Churn Rate" value={parseFloat(churn.churnRate.toFixed(1))} trend={-churn.churnRate} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <TrendChart title="Revenue Trend" type="line" data={trendData} />
        <TrendChart title="Conversion Rate" type="bar" data={[{ name: "All Users", value: conversions.conversionRate }]} />
      </div>

      <div className="grid grid-cols-1 gap-4">
        <FunnelChart data={funnelData} />
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-xl font-semibold mb-4">Export Data</h2>
        <div className="flex gap-2">
          <Link href="/api/data/export?format=csv" className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700">Export CSV</Link>
          <Link href="/api/data/export?format=json" className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700">Export JSON</Link>
          <Link href="/api/data/export?format=parquet" className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700">Export Parquet</Link>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-xl font-semibold mb-4">Retention Curve</h2>
        <div className="space-y-2">
          {Object.entries(retention).map(([days, rate]) => (
            <div key={days} className="flex justify-between items-center">
              <span className="text-sm">{days} days</span>
              <div className="w-64 bg-gray-200 rounded-full h-2">
                <div className="bg-green-600 h-2 rounded-full" style={{ width: `${rate}%` }} />
              </div>
              <span className="text-sm font-semibold">{rate.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
