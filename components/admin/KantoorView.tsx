"use client";

import { useEffect, useState } from "react";
import { OfficeSim } from "@/components/admin/OfficeSim";
import { Office3D } from "@/components/admin/Office3D";

// Kantoor: kiezen tussen 3D en de plattegrond. Alleen de gekozen weergave draait
// (beide zijn animaties); de keuze wordt in deze browser onthouden.

const KEY = "zf-kantoor-weergave";

export function KantoorView() {
  const [view, setView] = useState<"3d" | "2d">("3d");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === "2d" || saved === "3d") setView(saved);
    } catch {
      /* geen opslag: standaard 3D */
    }
  }, []);

  const choose = (v: "3d" | "2d") => {
    setView(v);
    try {
      localStorage.setItem(KEY, v);
    } catch {
      /* niet erg */
    }
  };

  return (
    <div className="space-y-3">
      <div className="inline-flex rounded-lg border p-0.5" style={{ borderColor: "var(--a-border)" }} role="tablist" aria-label="Weergave van het kantoor">
        {([
          ["3d", "3D"],
          ["2d", "Plattegrond"],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={view === id}
            onClick={() => choose(id)}
            className="rounded-md px-3 py-1 text-xs font-semibold transition"
            style={view === id ? { background: "var(--a-elev)", color: "var(--a-text)" } : { color: "var(--a-mute)" }}
          >
            {label}
          </button>
        ))}
      </div>
      {view === "3d" ? <Office3D /> : <OfficeSim />}
    </div>
  );
}
