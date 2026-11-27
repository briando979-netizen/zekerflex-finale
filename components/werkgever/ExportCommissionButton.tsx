"use client";

import { useState } from "react";
import { exportCommissionCSV } from "@/app/werkgever/partners/actions";

interface ExportCommissionButtonProps {
  userId: string;
}

export function ExportCommissionButton({ userId }: ExportCommissionButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      const csv = await exportCommissionCSV(userId);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);

      link.setAttribute("href", url);
      link.setAttribute("download", `commissies-${new Date().toISOString().split("T")[0]}.csv`);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      alert("Fout bij exporteren: " + (err instanceof Error ? err.message : "Onbekende fout"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:bg-gray-400 text-sm font-semibold"
    >
      {loading ? "Exporteren..." : "📥 Exporteer als CSV"}
    </button>
  );
}
