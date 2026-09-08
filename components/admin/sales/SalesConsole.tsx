"use client";

import { useState } from "react";
import { SalesDashboard, type LeadDto } from "@/components/admin/SalesDashboard";
import { CampaignsTab, type CampaignDto } from "@/components/admin/sales/CampaignsTab";
import { EngineTab, type EngineSnapshot } from "@/components/admin/sales/EngineTab";
import { SuppressionTab, type SuppressionEntry } from "@/components/admin/sales/SuppressionTab";

type Tab = "leads" | "campagnes" | "motor" | "onderdrukking";

const TABS: { id: Tab; label: string }[] = [
  { id: "leads", label: "Leads" },
  { id: "campagnes", label: "Campagnes" },
  { id: "motor", label: "Motor" },
  { id: "onderdrukking", label: "Onderdrukkingslijst" },
];

export function SalesConsole({
  initialLeads,
  initialCampaigns,
  initialEngine,
  initialSuppression,
}: {
  initialLeads: LeadDto[];
  initialCampaigns: CampaignDto[];
  initialEngine: EngineSnapshot;
  initialSuppression: SuppressionEntry[];
}) {
  const [tab, setTab] = useState<Tab>("leads");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className="rounded-full px-3.5 py-1.5 text-xs font-semibold transition"
              style={{
                background: active ? "var(--a-accent)" : "var(--a-panel-2)",
                color: active ? "#04140d" : "var(--a-dim)",
                border: "1px solid var(--a-border)",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "leads" && <SalesDashboard initialLeads={initialLeads} />}
      {tab === "campagnes" && <CampaignsTab initialCampaigns={initialCampaigns} />}
      {tab === "motor" && <EngineTab initial={initialEngine} />}
      {tab === "onderdrukking" && <SuppressionTab initial={initialSuppression} />}
    </div>
  );
}
