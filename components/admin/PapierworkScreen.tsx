"use client";

import { useMemo, useState } from "react";
import { PageHead, Panel, Pill } from "@/components/admin/kit";
import { form83bChecklist, FORM_83B_INSTRUCTIONS } from "@/lib/admin/papierwork/form-83b-checklist";
import { kvkChecklist, KVK_INSTRUCTIONS } from "@/lib/admin/papierwork/kvk-checklist";

type TabId = "83b" | "kvk";

const StatusBadge = ({ status }: { status: string }) => {
  const badges = {
    complete: { color: "bg-green-100 text-green-800", label: "✓ Klaar" },
    "on-track": { color: "bg-blue-100 text-blue-800", label: "✓ Op schema" },
    "not-started": { color: "bg-gray-100 text-gray-800", label: "✗ Niet begonnen" },
    "at-risk": { color: "bg-amber-100 text-amber-800", label: "⚠ Risico" },
    overdue: { color: "bg-red-100 text-red-800", label: "✗ Verlopen" },
  };
  const badge = badges[status as keyof typeof badges] ?? badges["not-started"];
  return <span className={`px-3 py-1 rounded-full text-sm font-medium ${badge.color}`}>{badge.label}</span>;
};

const ChecklistItemComponent = ({ item }: { item: any }) => {
  const statusColors = {
    done: "bg-green-50 border-green-200",
    "in-progress": "bg-blue-50 border-blue-200",
    pending: "bg-gray-50 border-gray-200",
  };

  const statusIcons = {
    done: "✓",
    "in-progress": "◐",
    pending: "○",
  };

  return (
    <div className={`border-l-4 ${statusColors[item.status as keyof typeof statusColors] ?? ""} p-4 mb-3`}>
      <div className="flex items-start gap-3">
        <div className="text-xl font-bold mt-0.5" style={{ color: "var(--a-mute)" }}>
          {statusIcons[item.status as keyof typeof statusIcons] ?? "○"}
        </div>
        <div className="flex-1">
          <div className="flex items-start justify-between">
            <div>
              <h4 className="font-semibold">{item.title}</h4>
              <p className="text-sm" style={{ color: "var(--a-mute)" }}>
                {item.description}
              </p>
            </div>
            {item.dueDate && (
              <div className="text-xs whitespace-nowrap ml-2" style={{ color: "var(--a-mute)" }}>
                {item.dueDate}
              </div>
            )}
          </div>
          {(item.proof || item.notes) && (
            <div className="mt-2 text-xs space-y-1">
              {item.proof && <div>📎 {item.proof}</div>}
              {item.notes && <div style={{ color: "var(--a-mute)" }}>💡 {item.notes}</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export function PapierworkScreen() {
  const [activeTab, setActiveTab] = useState<TabId>("83b");
  const now = useMemo(() => new Date(), []);

  const form83b = useMemo(() => form83bChecklist(now), [now]);
  const kvk = useMemo(() => kvkChecklist(now), [now]);

  return (
    <div className="space-y-4">
      <PageHead
        title="Papierwork & Deadlines"
        subtitle="Juridische taken met vaste deadlines"
        meta={
          <div className="text-sm" style={{ color: "var(--a-mute)" }}>
            Vandaag: {now.toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short" })}
          </div>
        }
      />

      <div className="flex gap-2 border-b" style={{ borderColor: "var(--a-border)" }}>
        {(["83b", "kvk"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="px-4 py-3 font-medium transition-colors"
            style={{
              borderBottom: activeTab === tab ? "2px solid var(--a-primary)" : "transparent",
              color: activeTab === tab ? "var(--a-primary)" : "var(--a-mute)",
            }}
          >
            {tab === "83b" ? "IRS 83(b)" : "KvK Registratie"}
          </button>
        ))}
      </div>

      {activeTab === "83b" && (
        <div className="space-y-4">
          <Panel className="bg-gradient-to-br" title="IRS Form 83(b) — Stock Option Election" flush>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <div className="text-xs font-medium" style={{ color: "var(--a-mute)" }}>
                    Dag van toekenning
                  </div>
                  <div className="text-lg font-semibold mt-1">9 november 2026</div>
                </div>
                <div>
                  <div className="text-xs font-medium" style={{ color: "var(--a-mute)" }}>
                    Deadline IRS
                  </div>
                  <div className="text-lg font-semibold mt-1">9 december 2026</div>
                </div>
                <div>
                  <div className="text-xs font-medium" style={{ color: "var(--a-mute)" }}>
                    Dag nog
                  </div>
                  <div className="text-lg font-semibold mt-1 text-orange-600">{form83b.daysUntilDeadline} dagen</div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: "var(--a-border)" }}>
                <div>
                  <div className="font-semibold">Algehele status</div>
                  <div className="text-sm" style={{ color: "var(--a-mute)" }}>
                    {form83b.overallStatus === "complete"
                      ? "Alles gedaan; wacht op IRS-bevestiging"
                      : form83b.overallStatus === "on-track"
                        ? "Op schema; handeling vereist voor 2026-12-05"
                        : "Aandacht nodig"}
                  </div>
                </div>
                <StatusBadge status={form83b.overallStatus} />
              </div>
            </div>
          </Panel>

          <Panel title="Checklist" flush>
            <div className="p-5">
              {form83b.items.map((item) => (
                <ChecklistItemComponent key={item.id} item={item} />
              ))}
            </div>
          </Panel>

          <Panel title="Wat is dit?" flush>
            <div className="p-5 prose prose-sm max-w-none">
              {FORM_83B_INSTRUCTIONS.split("\n").map((line, i) => {
                if (line.startsWith("## ")) {
                  return (
                    <h3 key={i} className="font-bold text-base mt-4 mb-2">
                      {line.replace(/^## /, "")}
                    </h3>
                  );
                } else if (line.startsWith("- ")) {
                  return (
                    <div key={i} className="ml-4 my-1">
                      • {line.replace(/^- /, "")}
                    </div>
                  );
                } else if (line) {
                  return (
                    <div key={i} className="text-sm my-2" style={{ color: "var(--a-text)" }}>
                      {line}
                    </div>
                  );
                }
                return null;
              })}
            </div>
          </Panel>
        </div>
      )}

      {activeTab === "kvk" && (
        <div className="space-y-4">
          <Panel className="bg-gradient-to-br" title="KvK Registratie — Buitenlandse Onderneming" flush>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <div className="text-xs font-medium" style={{ color: "var(--a-mute)" }}>
                    Status
                  </div>
                  <div className="text-lg font-semibold mt-1">Niet begonnen</div>
                </div>
                <div>
                  <div className="text-xs font-medium" style={{ color: "var(--a-mute)" }}>
                    Deadline
                  </div>
                  <div className="text-lg font-semibold mt-1">17 december 2026</div>
                </div>
                <div>
                  <div className="text-xs font-medium" style={{ color: "var(--a-mute)" }}>
                    Dag nog
                  </div>
                  <div className="text-lg font-semibold mt-1 text-orange-600">{kvk.daysUntilDeadline} dagen</div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: "var(--a-border)" }}>
                <div>
                  <div className="font-semibold">Algehele status</div>
                  <div className="text-sm" style={{ color: "var(--a-mute)" }}>
                    Vereist voor btw en Wtta; begin zo snel mogelijk
                  </div>
                </div>
                <StatusBadge status={kvk.overallStatus} />
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm">
                <div className="font-semibold text-blue-900">💡 Geschatte kosten</div>
                <div className="text-blue-800 mt-1">{kvk.estimatedCost}</div>
              </div>
            </div>
          </Panel>

          <Panel title="Checklist (Kritieke Volgorde)" flush>
            <div className="p-5">
              {kvk.items.map((item) => (
                <div key={item.id}>
                  {item.criticalPath && (
                    <div className="text-xs font-bold mb-1" style={{ color: "var(--a-warn)" }}>
                      🔴 KRITIEK
                    </div>
                  )}
                  <ChecklistItemComponent item={item} />
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Wat is dit?" flush>
            <div className="p-5 prose prose-sm max-w-none">
              {KVK_INSTRUCTIONS.split("\n").map((line, i) => {
                if (line.startsWith("## ")) {
                  return (
                    <h3 key={i} className="font-bold text-base mt-4 mb-2">
                      {line.replace(/^## /, "")}
                    </h3>
                  );
                } else if (line.startsWith("- ")) {
                  return (
                    <div key={i} className="ml-4 my-1">
                      • {line.replace(/^- /, "")}
                    </div>
                  );
                } else if (line) {
                  return (
                    <div key={i} className="text-sm my-2" style={{ color: "var(--a-text)" }}>
                      {line}
                    </div>
                  );
                }
                return null;
              })}
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}
