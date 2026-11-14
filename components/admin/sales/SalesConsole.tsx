"use client";

import { useState } from "react";
import { SalesDashboard, type LeadDto } from "@/components/admin/SalesDashboard";
import { PipelineBoard } from "@/components/admin/sales/PipelineBoard";
import { CampaignsTab, type CampaignDto } from "@/components/admin/sales/CampaignsTab";
import { EngineTab, type EngineSnapshot } from "@/components/admin/sales/EngineTab";
import { SuppressionTab, type SuppressionEntry } from "@/components/admin/sales/SuppressionTab";

type Tab = "pijplijn" | "leads" | "campagnes" | "motor" | "onderdrukking";

const TABS: { id: Tab; label: string }[] = [
  { id: "pijplijn", label: "Bord" },
  { id: "leads", label: "Lijst" },
  { id: "campagnes", label: "Campagnes" },
  { id: "motor", label: "Motor" },
  { id: "onderdrukking", label: "Niet benaderen" },
];

export function SalesConsole({
  initialTab,
  initialFilter,
  initialLeads,
  initialCampaigns,
  initialEngine,
  initialSuppression,
}: {
  /** uit de querystring (?weergave=leads&filter=wacht), bv. vanaf de kaart op het beheerstartscherm */
  initialTab?: string | undefined;
  initialFilter?: string | undefined;
  initialLeads: LeadDto[];
  initialCampaigns: CampaignDto[];
  initialEngine: EngineSnapshot;
  initialSuppression: SuppressionEntry[];
}) {
  const [tab, setTab] = useState<Tab>(TABS.some((t) => t.id === initialTab) ? (initialTab as Tab) : "pijplijn");

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Weergave van de pijplijn" className="a-scroll-x flex gap-5 overflow-x-auto" style={{ borderBottom: "1px solid var(--a-border)" }}>
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className="relative whitespace-nowrap pb-2.5 text-[0.8125rem] transition-colors"
              style={{ color: active ? "var(--a-text)" : "var(--a-mute)", fontWeight: active ? 600 : 500 }}
            >
              {t.label}
              {active && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full" style={{ background: "var(--a-accent)" }} />}
            </button>
          );
        })}
      </div>

      {tab === "pijplijn" && <PipelineBoard initialLeads={initialLeads} />}
      {tab === "leads" && <SalesDashboard initialLeads={initialLeads} {...(initialFilter ? { initialFilter } : {})} />}
      {tab === "campagnes" && <CampaignsTab initialCampaigns={initialCampaigns} />}
      {tab === "motor" && <EngineTab initial={initialEngine} />}
      {tab === "onderdrukking" && <SuppressionTab initial={initialSuppression} />}
    </div>
  );
}
