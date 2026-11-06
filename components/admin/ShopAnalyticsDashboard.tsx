"use client";

import { KPI, SHOP_KPIs } from "@/lib/shop/metrics-definitions";

// Admin analytics dashboard — KPIs, trends, revenue breakdown

export function ShopAnalyticsDashboard() {
  const kpis = Object.values(SHOP_KPIs);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold" style={{ color: "var(--a-text)" }}>
          Shop Analytics
        </h2>
        <p className="text-sm" style={{ color: "var(--a-mute)" }}>
          Key metrics for your subscription business
        </p>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {kpis.map((kpi) => (
          <div
            key={kpi.id}
            className="rounded-lg border p-4"
            style={{ borderColor: "var(--a-border)" }}
          >
            <p className="text-xs font-semibold uppercase" style={{ color: "var(--a-mute)" }}>
              {kpi.category}
            </p>
            <p className="mt-1 text-2xl font-bold" style={{ color: "var(--a-text)" }}>
              {kpi.unit === "%" ? `${kpi.currentValue.toFixed(1)}%` : `${kpi.unit}${kpi.currentValue}`}
            </p>
            <p className="text-xs" style={{ color: "var(--a-mute)" }}>
              Target: {kpi.unit === "%" ? `${kpi.targetValue}%` : `${kpi.unit}${kpi.targetValue}`}
            </p>
            <div className="mt-2">
              <span
                style={{
                  color: kpi.trend === "up" ? "var(--a-ok)" : "var(--a-crit)",
                }}
              >
                {kpi.trend === "up" ? "↑" : "↓"} {kpi.trend}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Revenue breakdown */}
      <div className="rounded-lg border p-4" style={{ borderColor: "var(--a-border)" }}>
        <h3 className="font-semibold" style={{ color: "var(--a-text)" }}>
          Revenue Breakdown
        </h3>
        <div className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between">
            <span style={{ color: "var(--a-mute)" }}>One-time purchases</span>
            <span style={{ color: "var(--a-text)" }}>€2,450</span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: "var(--a-mute)" }}>Monthly subscriptions (MRR)</span>
            <span style={{ color: "var(--a-text)" }}>€1,200</span>
          </div>
          <div className="flex justify-between border-t pt-2" style={{ borderColor: "var(--a-border)" }}>
            <span style={{ color: "var(--a-text)", fontWeight: "bold" }}>Total Revenue</span>
            <span style={{ color: "var(--a-text)", fontWeight: "bold" }}>€16,850/year</span>
          </div>
        </div>
      </div>

      {/* Growth trajectory */}
      <div className="rounded-lg border p-4" style={{ borderColor: "var(--a-border)" }}>
        <h3 className="font-semibold" style={{ color: "var(--a-text)" }}>
          Growth Metrics
        </h3>
        <div className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between">
            <span style={{ color: "var(--a-mute)" }}>Customer acquisition (month)</span>
            <span style={{ color: "var(--a-text)" }}>+23 (↑ 12%)</span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: "var(--a-mute)" }}>Subscription upgrades</span>
            <span style={{ color: "var(--a-text)" }}>5 this month</span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: "var(--a-mute)" }}>Referral signups</span>
            <span style={{ color: "var(--a-text)" }}>12 (€1,200 MRR impact)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
