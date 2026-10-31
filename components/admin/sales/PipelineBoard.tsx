"use client";

import { useCallback, useMemo, useState } from "react";
import type { LeadDto } from "@/components/admin/SalesDashboard";

// ---------------------------------------------------------------------------
// Salesforce-achtig kanban-bord voor de sales-pijplijn. Kolommen per fase,
// sleepbare kaarten (slepen = fase wijzigen), en per kaart meteen zichtbaar of
// de lead bereikbaar is (📞 / ✉️) met een inline "bel" of "zoek nummer". Zo is
// het bord óók het gereedschap om het datagat (lege nummers) te dichten.
// ---------------------------------------------------------------------------

type StageId = "nieuw" | "benaderd" | "gesprek" | "gewonnen" | "verloren";

const COLUMNS: { id: StageId; label: string; set: string; accent: string; statuses: string[] }[] = [
  { id: "nieuw", label: "Nieuw", set: "NEW", accent: "#64748b", statuses: ["NEW", "ENRICHED"] },
  { id: "benaderd", label: "Benaderd", set: "QUEUED", accent: "#3b82f6", statuses: ["QUEUED", "DRAFTED", "APPROVED", "SENT"] },
  { id: "gesprek", label: "In gesprek", set: "REPLIED", accent: "#f59e0b", statuses: ["REPLIED"] },
  { id: "gewonnen", label: "Gewonnen", set: "WON", accent: "#10b981", statuses: ["WON"] },
  { id: "verloren", label: "Verloren", set: "LOST", accent: "#9ca3af", statuses: ["LOST", "BOUNCED", "UNSUBSCRIBED", "DISQUALIFIED"] },
];

function columnOf(status: string): StageId {
  return COLUMNS.find((c) => c.statuses.includes(status))?.id ?? "nieuw";
}

export function PipelineBoard({ initialLeads }: { initialLeads: LeadDto[] }) {
  const [leads, setLeads] = useState<LeadDto[]>(initialLeads);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<StageId | null>(null);

  const byColumn = useMemo(() => {
    const map: Record<StageId, LeadDto[]> = { nieuw: [], benaderd: [], gesprek: [], gewonnen: [], verloren: [] };
    for (const l of leads) map[columnOf(l.status)].push(l);
    for (const id of Object.keys(map) as StageId[]) {
      map[id].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    }
    return map;
  }, [leads]);

  const move = useCallback(async (id: string, col: StageId) => {
    const column = COLUMNS.find((c) => c.id === col);
    if (!column) return;
    const lead = leads.find((l) => l.id === id);
    if (!lead || columnOf(lead.status) === col) return;
    setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, status: column.set } : l)));
    try {
      const res = await fetch(`/api/admin/sales/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set-stage", status: column.set }),
      });
      if (!res.ok) {
        setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, status: lead.status } : l)));
        setMsg("Verplaatsen mislukte.");
      }
    } catch {
      setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, status: lead.status } : l)));
      setMsg("Netwerkfout.");
    }
  }, [leads]);

  const callLead = useCallback(async (id: string, phone: string) => {
    setBusy(`${id}:call`);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/telephony", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "call", to: phone, leadId: id, b2b: true, script: "intro-werkgever" }),
      });
      const d = await res.json().catch(() => ({}));
      setMsg(res.ok && d.ok ? `📞 Oproep gestart naar ${phone}.` : `Bellen mislukt: ${d.reason ?? "onbekend"}`);
    } catch {
      setMsg("Netwerkfout.");
    } finally {
      setBusy(null);
    }
  }, []);

  const scrape = useCallback(async (id: string) => {
    setBusy(`${id}:scrape`);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/sales/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "scrape-contact" }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.lead) {
        setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, contactPhone: d.lead.contactPhone ?? l.contactPhone, contactEmail: d.lead.contactEmail ?? l.contactEmail } : l)));
        setMsg(d.lead.contactPhone ? "Nummer gevonden." : d.lead.contactEmail ? "E-mail gevonden, geen nummer." : "Niks gevonden op de website.");
      } else {
        setMsg("Opzoeken mislukte.");
      }
    } catch {
      setMsg("Netwerkfout.");
    } finally {
      setBusy(null);
    }
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <p className="text-xs" style={{ color: "var(--a-mute)" }}>
          Sleep een kaart naar een andere kolom om de fase te wijzigen. 📞/✉️ tonen of de lead bereikbaar is.
        </p>
        {msg && <span className="text-xs font-medium" style={{ color: "var(--a-accent)" }}>{msg}</span>}
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        {COLUMNS.map((col) => {
          const items = byColumn[col.id];
          return (
            <div
              key={col.id}
              onDragOver={(e) => {
                e.preventDefault();
                setOverCol(col.id);
              }}
              onDragLeave={() => setOverCol((c) => (c === col.id ? null : c))}
              onDrop={() => {
                setOverCol(null);
                if (dragId) void move(dragId, col.id);
                setDragId(null);
              }}
              className="flex min-h-[120px] flex-col rounded-xl p-2 transition"
              style={{
                background: overCol === col.id ? "var(--a-elev)" : "var(--a-panel-2)",
                border: `1px solid ${overCol === col.id ? col.accent : "var(--a-border)"}`,
              }}
            >
              <div className="mb-2 flex items-center gap-2 px-1">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: col.accent }} />
                <span className="text-xs font-semibold" style={{ color: "var(--a-text)" }}>{col.label}</span>
                <span className="ml-auto rounded-full px-1.5 text-[10px]" style={{ background: "var(--a-elev)", color: "var(--a-mute)" }}>
                  {items.length}
                </span>
              </div>

              <div className="space-y-2 overflow-y-auto" style={{ maxHeight: "60vh" }}>
                {items.map((l) => (
                  <div
                    key={l.id}
                    draggable
                    onDragStart={() => setDragId(l.id)}
                    onDragEnd={() => setDragId(null)}
                    className="cursor-grab rounded-lg p-2.5 active:cursor-grabbing"
                    style={{ background: "var(--a-panel)", border: "1px solid var(--a-border)", opacity: dragId === l.id ? 0.5 : 1 }}
                  >
                    <div className="flex items-start gap-1.5">
                      <span className="flex-1 text-[13px] font-semibold leading-tight" style={{ color: "var(--a-text)" }}>
                        {l.companyName}
                      </span>
                      {typeof l.score === "number" && (
                        <span
                          className="rounded px-1.5 text-[10px] font-bold"
                          style={{
                            background: l.score >= 60 ? "rgba(16,185,129,0.15)" : l.score >= 40 ? "rgba(245,158,11,0.15)" : "var(--a-elev)",
                            color: l.score >= 60 ? "#10b981" : l.score >= 40 ? "#f59e0b" : "var(--a-dim)",
                          }}
                        >
                          {l.score}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[11px]" style={{ color: "var(--a-mute)" }}>
                      <span title={l.contactPhone ?? "geen nummer"} style={{ color: l.contactPhone ? "#10b981" : "var(--a-mute)" }}>
                        {l.contactPhone ? "📞" : "📵"}
                      </span>
                      <span title={l.contactEmail ?? "geen e-mail"} style={{ color: l.contactEmail ? "#10b981" : "var(--a-mute)" }}>
                        {l.contactEmail ? "✉️" : "✖"}
                      </span>
                      {l.city && <span className="truncate">· {l.city}</span>}
                    </div>
                    <div className="mt-1.5 flex gap-1.5">
                      {l.contactPhone ? (
                        <button
                          type="button"
                          onClick={() => void callLead(l.id, l.contactPhone!)}
                          disabled={busy !== null}
                          className="rounded px-2 py-0.5 text-[11px] font-semibold disabled:opacity-40"
                          style={{ background: "var(--a-accent)", color: "#04140d" }}
                        >
                          {busy === `${l.id}:call` ? "…" : "📞 Bel"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void scrape(l.id)}
                          disabled={busy !== null}
                          className="rounded px-2 py-0.5 text-[11px] disabled:opacity-40"
                          style={{ border: "1px solid var(--a-border)", color: "var(--a-dim)" }}
                        >
                          {busy === `${l.id}:scrape` ? "Zoeken…" : "📇 Zoek nr."}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {items.length === 0 && (
                  <p className="px-1 py-3 text-center text-[11px]" style={{ color: "var(--a-mute)" }}>leeg</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
