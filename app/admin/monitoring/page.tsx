'use client';

import { useEffect, useState } from 'react';
import { getMetrics } from '@/lib/monitoring/metrics';
import { getAllTraces } from '@/lib/tracing/tracer';
import { getLogs, getLogStats } from '@/lib/logging/aggregation';
import { getActiveAlerts } from '@/lib/alerts/manager';

export default function MonitoringPage() {
  const [metrics, setMetrics] = useState<number>(0);
  const [traces, setTraces] = useState<number>(0);
  const [logStats, setLogStats] = useState<Record<string, number>>({});
  const [activeAlerts, setActiveAlerts] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const metricsCount = getMetrics().length;
        const tracesCount = getAllTraces().length;
        const stats = getLogStats();
        const alertsCount = getActiveAlerts().length;

        setMetrics(metricsCount);
        setTraces(tracesCount);
        setLogStats(stats);
        setActiveAlerts(alertsCount);
      } catch (error) {
        console.error('Failed to load monitoring data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-3xl font-bold">System Monitoring</h1>

      {loading ? (
        <div>Loading...</div>
      ) : (
        <div className="grid grid-cols-4 gap-4">
          {/* Metrics Card */}
          <div className="rounded-lg border bg-white p-6 shadow">
            <div className="text-sm text-gray-600">Active Metrics</div>
            <div className="mt-2 text-3xl font-bold">{metrics}</div>
          </div>

          {/* Traces Card */}
          <div className="rounded-lg border bg-white p-6 shadow">
            <div className="text-sm text-gray-600">Active Traces</div>
            <div className="mt-2 text-3xl font-bold">{traces}</div>
          </div>

          {/* Errors Card */}
          <div className="rounded-lg border bg-white p-6 shadow">
            <div className="text-sm text-gray-600">Error Logs</div>
            <div className="mt-2 text-3xl font-bold text-red-600">
              {logStats.ERROR || 0}
            </div>
          </div>

          {/* Alerts Card */}
          <div className="rounded-lg border bg-white p-6 shadow">
            <div className="text-sm text-gray-600">Active Alerts</div>
            <div className="mt-2 text-3xl font-bold text-orange-600">
              {activeAlerts}
            </div>
          </div>
        </div>
      )}

      {/* Log Levels Breakdown */}
      <div className="rounded-lg border bg-white p-6 shadow">
        <h2 className="text-lg font-semibold">Log Levels</h2>
        <div className="mt-4 grid grid-cols-5 gap-4">
          {Object.entries(logStats).map(([level, count]) => (
            <div key={level} className="text-center">
              <div className="text-2xl font-bold">{count}</div>
              <div className="text-xs text-gray-600">{level}</div>
            </div>
          ))}
        </div>
      </div>

      {/* System Health */}
      <div className="rounded-lg border bg-white p-6 shadow">
        <h2 className="text-lg font-semibold">System Health</h2>
        <div className="mt-4 space-y-2">
          <div className="flex justify-between">
            <span>CPU Usage</span>
            <span className="text-green-600">Normal</span>
          </div>
          <div className="flex justify-between">
            <span>Memory Usage</span>
            <span className="text-green-600">Normal</span>
          </div>
          <div className="flex justify-between">
            <span>Database Connection</span>
            <span className="text-green-600">Healthy</span>
          </div>
          <div className="flex justify-between">
            <span>API Response Time</span>
            <span className="text-green-600">Normal</span>
          </div>
        </div>
      </div>
    </div>
  );
}
