'use client';

import { useEffect, useState } from 'react';

export default function MarketplaceAdminPage() {
  const [stats, setStats] = useState({
    totalApps: 0,
    publishedApps: 0,
    activeInstallations: 0,
    totalRevenueThisMonth: 0,
    platformFeeThisMonth: 0,
  });

  useEffect(() => {
    // Fetch stats
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/admin/marketplace/stats');
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
      } catch (err) {
        console.error('Failed to fetch stats:', err);
      }
    };

    fetchStats();
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Marketplace Beheer</h1>
        <p className="text-muted-foreground mt-2">Beheer apps, partners en integaties</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card border rounded-lg p-4">
          <p className="text-sm font-medium text-muted-foreground">Totale Apps</p>
          <p className="text-3xl font-bold mt-2">{stats.totalApps}</p>
        </div>
        <div className="bg-card border rounded-lg p-4">
          <p className="text-sm font-medium text-muted-foreground">Gepubliceerd</p>
          <p className="text-3xl font-bold mt-2">{stats.publishedApps}</p>
        </div>
        <div className="bg-card border rounded-lg p-4">
          <p className="text-sm font-medium text-muted-foreground">Actieve Installaties</p>
          <p className="text-3xl font-bold mt-2">{stats.activeInstallations}</p>
        </div>
        <div className="bg-card border rounded-lg p-4">
          <p className="text-sm font-medium text-muted-foreground">Platform Fee (Maand)</p>
          <p className="text-3xl font-bold mt-2">€{(stats.platformFeeThisMonth / 100).toFixed(2)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-card border rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Recente Apps</h2>
          <p className="text-muted-foreground">Wachtend op review...</p>
        </div>

        <div className="bg-card border rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Top Partners</h2>
          <p className="text-muted-foreground">Top 10 partners op basis van inkomsten...</p>
        </div>
      </div>
    </div>
  );
}
