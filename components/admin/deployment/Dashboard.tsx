"use client";

import { useEffect, useState } from "react";

interface Deployment {
  id: string;
  status: "success" | "failure" | "in-progress";
  branch: string;
  commit: string;
  duration: number;
  timestamp: string;
  stages: Array<{ name: string; success: boolean }>;
}

export function DeploymentDashboard() {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch("/api/admin/deployments");
        if (r.ok) {
          const data = await r.json();
          setDeployments(data.deployments || []);
        }
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    };

    void load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);

  if (loading) return <div className="p-4">Laden...</div>;

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-2xl font-bold">Deployment Dashboard</h1>

      <div className="grid gap-4">
        {deployments.map((dep) => (
          <div
            key={dep.id}
            className="rounded-lg border border-gray-200 p-4 shadow"
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span
                  className={`inline-block h-3 w-3 rounded-full ${
                    dep.status === "success"
                      ? "bg-green-500"
                      : dep.status === "failure"
                        ? "bg-red-500"
                        : "bg-yellow-500"
                  }`}
                />
                <div>
                  <div className="font-semibold">{dep.branch}</div>
                  <div className="text-xs text-gray-500">{dep.commit}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-medium">{dep.duration}ms</div>
                <div className="text-xs text-gray-500">
                  {new Date(dep.timestamp).toLocaleTimeString()}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              {dep.stages.map((stage) => (
                <div key={stage.name} className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      stage.success ? "bg-green-500" : "bg-gray-300"
                    }`}
                  />
                  <span className="text-sm">{stage.name}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
