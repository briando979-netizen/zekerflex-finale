"use client";

import { useEffect, useState } from "react";

interface LogEntry {
  id: string;
  timestamp: string;
  level: "debug" | "info" | "warn" | "error" | "fatal";
  source: string;
  message: string;
  context?: Record<string, any>;
  deploymentId?: string;
}

export function LogsViewer() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch("/api/admin/logs?limit=100");
        if (r.ok) {
          const data = await r.json();
          setLogs(data.logs || []);
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

  const getLevelColor = (level: string) => {
    switch (level) {
      case "error":
        return "bg-red-100 text-red-800";
      case "warn":
        return "bg-yellow-100 text-yellow-800";
      case "info":
        return "bg-blue-100 text-blue-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const filteredLogs =
    filter === "all"
      ? logs
      : logs.filter(l => l.level === filter || (filter === "errors" && (l.level === "error" || l.level === "fatal")));

  if (loading) return <div className="p-4">Laden...</div>;

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Logs</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setFilter("all")}
            className={`px-3 py-1 rounded ${filter === "all" ? "bg-blue-500 text-white" : "bg-gray-200"}`}
          >
            All
          </button>
          <button
            onClick={() => setFilter("info")}
            className={`px-3 py-1 rounded ${filter === "info" ? "bg-blue-500 text-white" : "bg-gray-200"}`}
          >
            Info
          </button>
          <button
            onClick={() => setFilter("warn")}
            className={`px-3 py-1 rounded ${filter === "warn" ? "bg-yellow-500 text-white" : "bg-gray-200"}`}
          >
            Warn
          </button>
          <button
            onClick={() => setFilter("errors")}
            className={`px-3 py-1 rounded ${filter === "errors" ? "bg-red-500 text-white" : "bg-gray-200"}`}
          >
            Errors
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {filteredLogs.map(log => (
          <div key={log.id} className="rounded-lg border border-gray-200 p-3">
            <div className="mb-2 flex items-start justify-between">
              <div className="flex items-center gap-2">
                <span className={`rounded px-2 py-1 text-xs font-bold ${getLevelColor(log.level)}`}>
                  {log.level.toUpperCase()}
                </span>
                <span className="text-sm font-semibold text-gray-700">{log.source}</span>
              </div>
              <span className="text-xs text-gray-500">{new Date(log.timestamp).toLocaleTimeString()}</span>
            </div>
            <p className="text-sm text-gray-800">{log.message}</p>
            {log.context && (
              <div className="mt-2 rounded bg-gray-50 p-2">
                <pre className="text-xs text-gray-600">{JSON.stringify(log.context, null, 2)}</pre>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
