"use client";

import { useEffect, useState } from "react";

type AuditResult = {
  audited: number;
  message: string;
};

export function QualityAuditPanel() {
  const [result, setResult] = useState<AuditResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastRun, setLastRun] = useState<Date | null>(null);

  const runAudit = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/internal/quality-audit", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET || ""}`,
        },
      });
      if (res.ok) {
        const data = (await res.json()) as AuditResult;
        setResult(data);
        setLastRun(new Date());
      }
    } catch (err) {
      console.error("Audit failed", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Load last run time from localStorage
    const saved = localStorage.getItem("quality-audit-last-run");
    if (saved) {
      setLastRun(new Date(saved));
    }
  }, []);

  return (
    <div className="rounded-lg border border-hair bg-white p-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold text-ink">Kwaliteitbewaking</h3>
        <button
          onClick={runAudit}
          disabled={loading}
          className="px-3 py-1 rounded-lg bg-brand-500 text-white text-sm font-semibold hover:bg-brand-600 disabled:opacity-50"
        >
          {loading ? "Bezig..." : "Audit uitvoeren"}
        </button>
      </div>

      {result && (
        <div className="p-3 rounded-lg bg-success/10 border border-success/20">
          <p className="text-sm font-semibold text-success mb-1">✓ Audit voltooid</p>
          <p className="text-xs text-neutralx-600">
            {result.audited} diensten gecontroleerd en gescoord
          </p>
        </div>
      )}

      {lastRun && (
        <p className="text-xs text-neutralx-500 mt-3">
          Laatste controle: {lastRun.toLocaleString()}
        </p>
      )}
    </div>
  );
}
