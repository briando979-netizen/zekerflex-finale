"use client";

import { useEffect, useState } from "react";

interface PerformanceMetric {
  timestamp: string;
  buildTime: number;
  testTime: number;
  bundleSize: number;
  errorRate: number;
  uptime: number;
}

interface TestMetric {
  timestamp: string;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  coverage: number;
  duration: number;
}

export function AnalyticsDashboard() {
  const [perfMetrics, setPerfMetrics] = useState<PerformanceMetric[]>([]);
  const [testMetrics, setTestMetrics] = useState<TestMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"performance" | "tests">("performance");

  useEffect(() => {
    const load = async () => {
      try {
        const perfRes = await fetch("/api/admin/analytics?type=performance");
        if (perfRes.ok) {
          const data = await perfRes.json();
          setPerfMetrics(data.metrics || []);
        }

        const testRes = await fetch("/api/admin/analytics?type=tests");
        if (testRes.ok) {
          const data = await testRes.json();
          setTestMetrics(data.metrics || []);
        }
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    };

    void load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, []);

  if (loading) return <div className="p-4">Laden...</div>;

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-2xl font-bold">Analytics Dashboard</h1>

      <div className="mb-4 flex gap-2 border-b">
        <button
          onClick={() => setTab("performance")}
          className={`px-4 py-2 font-semibold ${
            tab === "performance"
              ? "border-b-2 border-blue-500 text-blue-500"
              : "text-gray-500"
          }`}
        >
          Performance
        </button>
        <button
          onClick={() => setTab("tests")}
          className={`px-4 py-2 font-semibold ${
            tab === "tests"
              ? "border-b-2 border-blue-500 text-blue-500"
              : "text-gray-500"
          }`}
        >
          Tests
        </button>
      </div>

      {tab === "performance" && (
        <div className="grid gap-4">
          {perfMetrics.map((metric, i) => (
            <div key={i} className="rounded-lg border border-gray-200 p-4">
              <div className="mb-3 text-sm text-gray-500">
                {new Date(metric.timestamp).toLocaleString()}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-gray-600">Build Time</div>
                  <div className="text-lg font-bold">{metric.buildTime}ms</div>
                </div>
                <div>
                  <div className="text-xs text-gray-600">Test Time</div>
                  <div className="text-lg font-bold">{metric.testTime}ms</div>
                </div>
                <div>
                  <div className="text-xs text-gray-600">Bundle Size</div>
                  <div className="text-lg font-bold">
                    {(metric.bundleSize / 1024).toFixed(1)}KB
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-600">Uptime</div>
                  <div className="text-lg font-bold">{metric.uptime}%</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "tests" && (
        <div className="grid gap-4">
          {testMetrics.map((metric, i) => (
            <div key={i} className="rounded-lg border border-gray-200 p-4">
              <div className="mb-3 text-sm text-gray-500">
                {new Date(metric.timestamp).toLocaleString()}
              </div>
              <div className="mb-3 space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm">Success Rate</span>
                  <span className="font-bold">
                    {metric.totalTests > 0
                      ? (
                          ((metric.passedTests / metric.totalTests) * 100).toFixed(1)
                        )
                      : 0}
                    %
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-gray-200">
                  <div
                    className="h-full bg-green-500"
                    style={{
                      width: `${metric.totalTests > 0 ? (metric.passedTests / metric.totalTests) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-gray-600">Total Tests</div>
                  <div className="text-lg font-bold">{metric.totalTests}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-600">Coverage</div>
                  <div className="text-lg font-bold">{metric.coverage}%</div>
                </div>
                <div>
                  <div className="text-xs text-green-600">Passed</div>
                  <div className="text-lg font-bold text-green-600">
                    {metric.passedTests}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-red-600">Failed</div>
                  <div className="text-lg font-bold text-red-600">
                    {metric.failedTests}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
