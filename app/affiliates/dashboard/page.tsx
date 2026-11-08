"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface AffiliateStats {
  summary: {
    totalClicks: number;
    totalConversions: number;
    conversionRate: number;
    totalValue: number;
    totalCommission: number;
    pendingCommission: number;
  };
  tier: string;
  commissionRate: number;
  topSources: Array<{ source: string; count: number }>;
  dailyStats: Array<{ date: string; clicks: number; conversions: number }>;
  lastPayout: string | null;
}

export default function AffiliateDashboard() {
  const [stats, setStats] = useState<AffiliateStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/affiliates/analytics");
        if (res.ok) {
          setStats(await res.json());
        }
      } catch (err) {
        console.error(err);
      }
      setLoading(false);
    };
    void load();
  }, []);

  if (loading) return <div className="p-8">Loading...</div>;
  if (!stats) return <div className="p-8">No data</div>;

  return (
    <div className="min-h-screen bg-white p-8">
      <h1 className="mb-8 text-3xl font-bold">Affiliate Dashboard</h1>

      {/* Stats Grid */}
      <div className="mb-8 grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border p-6">
          <div className="text-sm text-gray-600">Total Clicks</div>
          <div className="mt-2 text-3xl font-bold">{stats.summary.totalClicks}</div>
        </div>
        <div className="rounded-lg border p-6">
          <div className="text-sm text-gray-600">Conversions</div>
          <div className="mt-2 text-3xl font-bold">{stats.summary.totalConversions}</div>
        </div>
        <div className="rounded-lg border p-6">
          <div className="text-sm text-gray-600">Conversion Rate</div>
          <div className="mt-2 text-3xl font-bold">{stats.summary.conversionRate.toFixed(1)}%</div>
        </div>
      </div>

      {/* Earnings */}
      <div className="mb-8 grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border p-6">
          <div className="text-sm text-gray-600">Total Earnings</div>
          <div className="mt-2 text-3xl font-bold">€{stats.summary.totalCommission.toFixed(2)}</div>
        </div>
        <div className="rounded-lg border p-6">
          <div className="text-sm text-gray-600">Pending</div>
          <div className="mt-2 text-3xl font-bold">€{stats.summary.pendingCommission.toFixed(2)}</div>
        </div>
      </div>

      {/* Tier & Rate */}
      <div className="mb-8 flex gap-8">
        <div>
          <div className="text-sm font-semibold text-gray-600">Your Tier</div>
          <div className="mt-1 inline-block rounded-full bg-blue-100 px-3 py-1 text-sm font-semibold text-blue-900">{stats.tier}</div>
        </div>
        <div>
          <div className="text-sm font-semibold text-gray-600">Commission Rate</div>
          <div className="text-2xl font-bold">{stats.commissionRate}%</div>
        </div>
      </div>

      {/* Top Sources */}
      <div className="mb-8 rounded-lg border p-6">
        <h2 className="mb-4 font-semibold">Top Traffic Sources</h2>
        <div className="space-y-2">
          {stats.topSources.map((source) => (
            <div key={source.source} className="flex justify-between">
              <span>{source.source}</span>
              <span className="font-semibold">{source.count} clicks</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="rounded-lg border p-6">
        <h2 className="mb-4 font-semibold">Daily Performance</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2">Date</th>
              <th className="text-right py-2">Clicks</th>
              <th className="text-right py-2">Conversions</th>
            </tr>
          </thead>
          <tbody>
            {stats.dailyStats.slice(0, 10).map((day) => (
              <tr key={day.date} className="border-b">
                <td className="py-2">{day.date}</td>
                <td className="text-right">{day.clicks}</td>
                <td className="text-right">{day.conversions}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Links */}
      <div className="mt-8 flex gap-4">
        <Link href="/affiliates/links" className="rounded bg-blue-600 px-4 py-2 text-white">
          Generate Links
        </Link>
        <Link href="/affiliates/payouts" className="rounded border border-gray-300 px-4 py-2">
          View Payouts
        </Link>
      </div>
    </div>
  );
}
