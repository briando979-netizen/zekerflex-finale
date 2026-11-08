'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface DeveloperStats {
  developer: any;
  stats: {
    totalApps: number;
    publishedApps: number;
    totalInstalls: number;
    activeInstallations: number;
    totalRevenueAllTimeCents: number;
    avgRating: number;
    apiUsagePercent: number;
  };
}

export default function DeveloperDashboard() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DeveloperStats | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/developers/stats');
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
      } catch (err) {
        console.error('Failed to fetch stats:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  if (loading) {
    return <div className="text-center py-8">Laden...</div>;
  }

  if (!stats) {
    return <div className="text-center py-8">Geen developer-gegevens gevonden</div>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Developer Dashboard</h1>
        <p className="text-muted-foreground mt-2">Beheer je apps en inkomsten</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card border rounded-lg p-4">
          <p className="text-sm font-medium text-muted-foreground">Apps</p>
          <p className="text-3xl font-bold mt-2">{stats.stats.totalApps}</p>
          <p className="text-xs text-muted-foreground mt-1">{stats.stats.publishedApps} gepubliceerd</p>
        </div>
        <div className="bg-card border rounded-lg p-4">
          <p className="text-sm font-medium text-muted-foreground">Installaties</p>
          <p className="text-3xl font-bold mt-2">{stats.stats.totalInstalls}</p>
          <p className="text-xs text-muted-foreground mt-1">{stats.stats.activeInstallations} actief</p>
        </div>
        <div className="bg-card border rounded-lg p-4">
          <p className="text-sm font-medium text-muted-foreground">Inkomsten</p>
          <p className="text-3xl font-bold mt-2">€{(stats.stats.totalRevenueAllTimeCents / 100).toFixed(2)}</p>
        </div>
        <div className="bg-card border rounded-lg p-4">
          <p className="text-sm font-medium text-muted-foreground">Rating</p>
          <p className="text-3xl font-bold mt-2">{stats.stats.avgRating.toFixed(1)}</p>
          <p className="text-xs text-muted-foreground mt-1">/ 5 sterren</p>
        </div>
      </div>

      <div className="bg-card border rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">API Gebruik</h2>
          <span className="text-sm text-muted-foreground">{stats.stats.apiUsagePercent.toFixed(1)}%</span>
        </div>
        <div className="w-full bg-muted rounded-full h-2">
          <div
            className="bg-brand-600 h-2 rounded-full transition-all"
            style={{ width: `${Math.min(100, stats.stats.apiUsagePercent)}%` }}
          />
        </div>
      </div>

      <div className="flex gap-4">
        <Link
          href="/developers/apps/create"
          className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 font-semibold text-white hover:bg-brand-700"
        >
          Nieuwe App
        </Link>
        <Link
          href="/developers/documentation"
          className="inline-flex items-center justify-center rounded-lg border px-4 py-2 font-semibold"
        >
          Documentatie
        </Link>
      </div>
    </div>
  );
}
