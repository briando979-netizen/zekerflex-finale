"use client";

import { useState } from "react";
import { PageHead } from "@/components/admin/kit";
import { AfzendersTab } from "./AfzendersTab";
import { BonnenTab } from "./BonnenTab";
import { BtwTab } from "./BtwTab";
import { OverzichtTab } from "./OverzichtTab";

// ---------------------------------------------------------------------------
// Beheer → Boekhouding. Drie tabbladen: Overzicht (administraties en wat je nog moet doen), Bonnen "even kijken" en
// Afzenders. De data komt uit /api/admin/boekhouding; hier alleen de indeling.
// ---------------------------------------------------------------------------

type Tab = "overzicht" | "bonnen" | "afzenders" | "btw";
const TABS: { id: Tab; label: string }[] = [
  { id: "overzicht", label: "Overzicht" },
  { id: "bonnen", label: "Bonnen: even kijken" },
  { id: "btw", label: "Btw" },
  { id: "afzenders", label: "Afzenders" },
];

export function BoekhoudingScherm() {
  const [tab, setTab] = useState<Tab>("overzicht");
  return (
    <div className="space-y-5">
      <PageHead title="Boekhouding" subtitle="De administraties van zekerflex, wat je nog moet doen en de bonnen die jij even moet nakijken." />
      <div role="tablist" aria-label="Onderdelen van de boekhouding" className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`a-btn ${tab === t.id ? "a-btn-primary" : ""}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "overzicht" && <OverzichtTab />}
      {tab === "bonnen" && <BonnenTab />}
      {tab === "btw" && <BtwTab />}
      {tab === "afzenders" && <AfzendersTab />}
    </div>
  );
}
