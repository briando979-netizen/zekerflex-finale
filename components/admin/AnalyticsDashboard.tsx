"use client";

import { FunnelAnalytics, AttributionModel } from "@/lib/shop/advanced-analytics";

export function AnalyticsDashboard() {
  const funnelData: FunnelAnalytics = {
    name: "Checkout Funnel",
    steps: [
      { name: "Cart View", count: 1250, completionTime: 0 },
      { name: "Checkout Start", count: 842, completionTime: 180000 },
      { name: "Payment Info", count: 645, completionTime: 240000 },
      { name: "Review Order", count: 612, completionTime: 150000 },
      { name: "Purchase Complete", count: 589, completionTime: 120000 },
    ],
    conversionRate: 47.1,
    dropOff: [
      { step: 1, count: 408 },
      { step: 2, count: 197 },
      { step: 3, count: 33 },
      { step: 4, count: 23 },
    ],
  };

  const attributionData: AttributionModel[] = [
    { channel: "organic_search", conversions: 245, revenue: 1225000, roi: 8.5 },
    { channel: "paid_ads", conversions: 189, revenue: 945000, roi: 3.2 },
    { channel: "email", conversions: 156, revenue: 780000, roi: 12.4 },
    { channel: "direct", conversions: 89, revenue: 445000, roi: 5.0 },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold" style={{ color: "var(--a-text)" }}>
          Advanced Analytics
        </h2>
        <p className="text-sm" style={{ color: "var(--a-mute)" }}>
          Funnel, attribution, cohort analysis
        </p>
      </div>

      {/* Funnel visualization */}
      <div className="rounded-lg border p-6" style={{ borderColor: "var(--a-border)" }}>
        <h3 className="mb-4 font-semibold" style={{ color: "var(--a-text)" }}>
          {funnelData.name} ({funnelData.conversionRate.toFixed(1)}% conversion)
        </h3>
        <div className="space-y-2">
          {funnelData.steps.map((step, idx) => (
            <div key={idx}>
              <div className="flex items-center justify-between text-sm">
                <span style={{ color: "var(--a-text)" }}>{step.name}</span>
                <span style={{ color: "var(--a-mute)" }}>{step.count} users</span>
              </div>
              <div
                className="h-2 rounded-full"
                style={{
                  backgroundColor: "var(--a-border)",
                  width: `${(step.count / funnelData.steps[0].count) * 100}%`,
                }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Attribution model */}
      <div className="rounded-lg border p-6" style={{ borderColor: "var(--a-border)" }}>
        <h3 className="mb-4 font-semibold" style={{ color: "var(--a-text)" }}>
          Channel Attribution
        </h3>
        <div className="space-y-3">
          {attributionData.map((attr) => (
            <div key={attr.channel} className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
              <div>
                <p className="font-medium" style={{ color: "var(--a-text)" }}>
                  {attr.channel.replace(/_/g, " ")}
                </p>
                <p className="text-xs" style={{ color: "var(--a-mute)" }}>
                  {attr.conversions} conversies · €{(attr.revenue / 100).toFixed(0)} revenue
                </p>
              </div>
              <div
                className="rounded px-2 py-1 font-semibold"
                style={{
                  backgroundColor: attr.roi > 8 ? "rgba(0, 200, 0, 0.1)" : "rgba(200, 150, 0, 0.1)",
                  color: attr.roi > 8 ? "var(--a-ok)" : "var(--a-warn)",
                }}
              >
                ROI {attr.roi.toFixed(1)}x
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick insights */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border p-4" style={{ borderColor: "var(--a-border)" }}>
          <p className="text-xs uppercase" style={{ color: "var(--a-mute)" }}>
            Biggest Dropoff
          </p>
          <p className="mt-1 font-bold" style={{ color: "var(--a-crit)" }}>
            Step 1→2 (32.6%)
          </p>
        </div>
        <div className="rounded-lg border p-4" style={{ borderColor: "var(--a-border)" }}>
          <p className="text-xs uppercase" style={{ color: "var(--a-mute)" }}>
            Best ROI Channel
          </p>
          <p className="mt-1 font-bold" style={{ color: "var(--a-ok)" }}>
            Email (12.4x)
          </p>
        </div>
      </div>
    </div>
  );
}
