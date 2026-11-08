"use client";

import { useEffect, useState } from "react";

interface Alert {
  id: string;
  deploymentId?: string;
  level: "info" | "warning" | "critical";
  title: string;
  message: string;
  channels: string[];
  createdAt: string;
  resolvedAt?: string;
}

export function AlertsPanel() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"active" | "all">("active");

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch("/api/admin/alerts");
        if (r.ok) {
          const data = await r.json();
          setAlerts(data.alerts || []);
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

  const resolveAlert = async (alertId: string) => {
    try {
      await fetch(`/api/admin/alerts?id=${alertId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resolve" }),
      });
      setAlerts(alerts.filter(a => a.id !== alertId));
    } catch {
      /* ignore */
    }
  };

  const getLevelColor = (level: string) => {
    switch (level) {
      case "critical":
        return "border-red-500 bg-red-50";
      case "warning":
        return "border-yellow-500 bg-yellow-50";
      default:
        return "border-blue-500 bg-blue-50";
    }
  };

  const getLevelBadge = (level: string) => {
    switch (level) {
      case "critical":
        return "bg-red-100 text-red-800";
      case "warning":
        return "bg-yellow-100 text-yellow-800";
      default:
        return "bg-blue-100 text-blue-800";
    }
  };

  const filtered =
    filter === "active" ? alerts.filter(a => !a.resolvedAt) : alerts;

  if (loading) return <div className="p-4">Laden...</div>;

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Alerts</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setFilter("active")}
            className={`px-3 py-1 rounded text-sm ${
              filter === "active"
                ? "bg-red-500 text-white"
                : "bg-gray-200 text-gray-800"
            }`}
          >
            Active ({alerts.filter(a => !a.resolvedAt).length})
          </button>
          <button
            onClick={() => setFilter("all")}
            className={`px-3 py-1 rounded text-sm ${
              filter === "all"
                ? "bg-blue-500 text-white"
                : "bg-gray-200 text-gray-800"
            }`}
          >
            All ({alerts.length})
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-gray-200 p-4 text-center text-gray-500">
          No {filter === "active" ? "active" : ""} alerts
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(alert => (
            <div
              key={alert.id}
              className={`rounded-lg border-l-4 p-4 ${getLevelColor(alert.level)}`}
            >
              <div className="mb-2 flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded px-2 py-1 text-xs font-bold ${getLevelBadge(alert.level)}`}
                  >
                    {alert.level.toUpperCase()}
                  </span>
                  <h3 className="font-semibold text-gray-900">{alert.title}</h3>
                </div>
                <span className="text-xs text-gray-500">
                  {new Date(alert.createdAt).toLocaleTimeString()}
                </span>
              </div>

              <p className="mb-3 text-sm text-gray-700">{alert.message}</p>

              <div className="flex items-center justify-between">
                <div className="flex gap-1">
                  {alert.channels.map(channel => (
                    <span
                      key={channel}
                      className="rounded bg-gray-200 px-2 py-0.5 text-xs text-gray-700"
                    >
                      {channel}
                    </span>
                  ))}
                </div>
                {!alert.resolvedAt && (
                  <button
                    onClick={() => resolveAlert(alert.id)}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800"
                  >
                    Resolve
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
