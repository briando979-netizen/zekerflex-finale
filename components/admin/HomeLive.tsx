"use client";

import { useEffect, useState } from "react";
import { Pill } from "@/components/admin/kit";

interface Snapshot {
  health: { database: boolean; cache: boolean; llm: { ok: boolean; model: string }; webPush: boolean };
  traffic: { activeVisitors: number };
}

/** De live regel bovenaan: wat er nu op de site gebeurt en of alles draait. */
export function HomeLive() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    let on = true;
    const load = async () => {
      try {
        const res = await fetch("/api/admin/overview", { cache: "no-store" });
        if (!on) return;
        if (res.ok) {
          setSnap(await res.json());
          setStale(false);
        } else setStale(true);
      } catch {
        if (on) setStale(true);
      }
    };
    void load();
    const timer = setInterval(load, 15_000);
    return () => {
      on = false;
      clearInterval(timer);
    };
  }, []);

  if (!snap) return null;
  const down = [
    !snap.health.database && "database",
    !snap.health.cache && "cache",
    !snap.health.llm.ok && "AI",
  ].filter(Boolean) as string[];
  const active = snap.traffic.activeVisitors;

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {stale ? <Pill tone="warn">Verbinding traag</Pill> : down.length > 0 ? <Pill tone="crit">Storing: {down.join(", ")}</Pill> : <Pill tone="ok">Alles draait</Pill>}
      <Pill tone="neutral" dot={false}>{active === 1 ? "1 bezoeker" : `${active} bezoekers`} nu op de site</Pill>
    </span>
  );
}
