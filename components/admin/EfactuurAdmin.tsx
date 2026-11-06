"use client";

import { useState } from "react";
import { Pill, type Tone } from "@/components/admin/kit";
import { DataTable } from "@/components/admin/kit-client";
import type { EfactuurStand } from "@/lib/efactuur/bezorging";

// Admin → Financiën → E-facturen: de stand per factuur, met "Opnieuw versturen".

const STATUS: Record<EfactuurStand["status"], { label: string; tone: Tone }> = {
  verstuurd: { label: "Verstuurd", tone: "ok" },
  klaar: { label: "Klaar (download)", tone: "plan" },
  mislukt: { label: "Mislukt", tone: "crit" },
  ongeldig: { label: "Gegevens onvolledig", tone: "warn" },
};

export function EfactuurAdmin({ standen, bedrijven }: { standen: EfactuurStand[]; bedrijven: Record<string, string> }) {
  const [rows, setRows] = useState(standen);
  const [busy, setBusy] = useState<string | null>(null);
  const [melding, setMelding] = useState<string | null>(null);

  async function opnieuw(invoiceId: string) {
    setBusy(invoiceId);
    setMelding(null);
    const r = await fetch(`/api/invoices/${invoiceId}/efactuur`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ opnieuw: true }) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    setBusy(null);
    if (!r?.ok) return setMelding(d?.error?.message ?? "Versturen lukte niet.");
    const stand = d.stand as EfactuurStand;
    setRows((cur) => cur.map((s) => (s.invoiceId === invoiceId ? stand : s)));
    setMelding(`${stand.nummer}: ${STATUS[stand.status].label}${stand.fouten[0] ? ` — ${stand.fouten[0]}` : ""}`);
  }

  return (
    <div>
      {melding && (
        <p role="status" className="mb-3 text-sm" style={{ color: "var(--a-dim)" }}>
          {melding}
        </p>
      )}
      <DataTable
        columns={[
          { key: "nummer", label: "Factuur" },
          { key: "bedrijf", label: "Bedrijf", hideOnMobile: true },
          { key: "status", label: "Stand" },
          { key: "via", label: "Via", hideOnMobile: true },
          { key: "ontvanger", label: "Naar", hideOnMobile: true },
          { key: "at", label: "Laatst", hideOnMobile: true },
          { key: "actie", label: "", align: "right" },
        ]}
        rows={rows.map((s) => ({
          id: s.invoiceId,
          cells: {
            nummer: s.nummer,
            bedrijf: (s.tenantId && bedrijven[s.tenantId]) || "—",
            status: (
              <span title={s.fouten.join(" ")}>
                <Pill tone={STATUS[s.status].tone}>{STATUS[s.status].label}</Pill>
              </span>
            ),
            via: s.via ?? "—",
            ontvanger: s.ontvanger ?? "—",
            at: new Date(s.at).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", dateStyle: "short", timeStyle: "short" }),
            actie: (
              <span className="inline-flex gap-2">
                <a href={`/api/invoices/${s.invoiceId}/ubl`} className="a-btn text-xs">
                  UBL
                </a>
                <button type="button" className="a-btn text-xs" disabled={busy === s.invoiceId} onClick={() => void opnieuw(s.invoiceId)}>
                  {busy === s.invoiceId ? "Bezig…" : "Opnieuw versturen"}
                </button>
              </span>
            ),
          },
          sort: { nummer: s.nummer, status: s.status, at: s.at },
          search: `${s.nummer} ${s.ontvanger ?? ""} ${(s.tenantId && bedrijven[s.tenantId]) || ""}`,
          filters: { status: s.status },
          csv: { nummer: s.nummer, bedrijf: (s.tenantId && bedrijven[s.tenantId]) || "", status: STATUS[s.status].label, via: s.via, ontvanger: s.ontvanger, at: s.at, fouten: s.fouten.join(" | ") },
        }))}
        filters={[{ key: "status", label: "Stand", chips: true, options: Object.entries(STATUS).map(([value, v]) => ({ value, label: v.label })) }]}
        searchPlaceholder="Zoek op factuurnummer of bedrijf"
        emptyText="Nog geen e-facturen verstuurd of klaargezet."
        csvName="e-facturen"
      />
    </div>
  );
}
