"use client";

import { useEffect, useState } from "react";
import { count, percentOf } from "@/lib/admin/format";
import { KpiStrip, Meter, NameCell, PageHead, Panel, Pill, StackBar } from "@/components/admin/kit";
import { DataTable, type TableRow } from "@/components/admin/kit-client";

interface Row {
  userId: string;
  name: string;
  email: string | null;
  workerKind: "zzp" | "flexwerker" | "uitzendkracht" | null;
  vatNumber: string | null;
  hasVat: boolean;
  vatValid: boolean;
  invoiceMode: string;
  complete: boolean;
  updatedAt: string;
}
interface Payload {
  rows: Row[];
  counts: { total: number; complete: number; zzp: number; flexwerker: number; uitzendkracht: number; vatInvalid: number };
}

const KIND: Record<string, string> = { zzp: "Zzp'er", flexwerker: "Flexwerker", uitzendkracht: "Uitzendkracht" };
const MODE: Record<string, string> = {
  "reverse-billing": "Reverse billing",
  "self-invoice": "Zelf-facturatie (KOR)",
  payroll: "Payroll / verloning",
};

export function FiscalBoard() {
  const [data, setData] = useState<Payload | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [revealing, setRevealing] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/fiscaal", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => undefined);
  }, []);

  async function reveal(userId: string) {
    setRevealing(userId);
    try {
      const res = await fetch("/api/admin/fiscaal/reveal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (res.ok) {
        const d = await res.json();
        setRevealed((r) => ({ ...r, [userId]: d.vatNumber || "—" }));
      }
    } finally {
      setRevealing(null);
    }
  }

  const head = (
    <PageHead
      title="Werkvormen & btw"
      subtitle="Btw-nummers en verloningsvorm per flexwerker, voor correcte facturatie en verloning. Btw-nummers zijn gemaskeerd totdat je op Openen klikt. Dat wordt vastgelegd in het auditspoor."
    />
  );

  if (!data) {
    return (
      <div className="space-y-4">
        {head}
        <div className="a-panel h-28 animate-pulse" />
      </div>
    );
  }

  const { counts } = data;
  const rows: TableRow[] = data.rows.map((r) => ({
    id: r.userId,
    search: `${r.name} ${r.email ?? ""}`,
    filters: { kind: r.workerKind ?? "", complete: r.complete ? "yes" : "no" },
    cells: {
      name: <NameCell name={r.name} {...(r.email ? { sub: r.email } : {})} href={`/admin/gebruikers/${r.userId}`} />,
      kind: r.workerKind ? KIND[r.workerKind] : "—",
      vat: !r.hasVat ? (
        "—"
      ) : revealed[r.userId] ? (
        <span className="inline-flex items-center gap-2">
          <span className="font-mono text-xs" style={{ color: "var(--a-text)" }}>{revealed[r.userId]}</span>
          <Pill tone={r.vatValid ? "ok" : "warn"}>{r.vatValid ? "Geldig" : "Ongeldig"}</Pill>
        </span>
      ) : (
        <button type="button" onClick={() => void reveal(r.userId)} disabled={revealing === r.userId} className="a-button text-xs">
          {revealing === r.userId ? "Bezig…" : "•••• Openen"}
        </button>
      ),
      mode: MODE[r.invoiceMode] ?? r.invoiceMode,
      status: <Pill tone={r.complete ? "ok" : "warn"}>{r.complete ? "Compleet" : "Onvolledig"}</Pill>,
    },
    sort: { name: r.name, kind: r.workerKind ?? "", mode: r.invoiceMode, status: r.complete ? 1 : 0 },
    csv: { name: r.name, kind: r.workerKind ? (KIND[r.workerKind] ?? "") : "", vat: r.hasVat ? "gemaskeerd" : "", mode: MODE[r.invoiceMode] ?? r.invoiceMode, status: r.complete ? "Compleet" : "Onvolledig" },
  }));

  return (
    <div className="space-y-4">
      {head}

      <KpiStrip
        items={[
          { label: "Profielen", value: count(counts.total), hint: "fiscaal ingevuld" },
          { label: "Compleet", value: `${percentOf(counts.complete, counts.total)}%`, hint: `${count(counts.complete)} van ${count(counts.total)}`, tone: counts.complete === counts.total ? "ok" : "warn" },
          { label: "Btw ongeldig", value: count(counts.vatInvalid), hint: counts.vatInvalid > 0 ? "controleer deze nummers" : "alles klopt", ...(counts.vatInvalid > 0 ? { tone: "crit" as const } : {}) },
          { label: "Zzp'ers", value: count(counts.zzp), hint: "factureren zelf of via reverse billing" },
          { label: "Uitzendkrachten", value: count(counts.uitzendkracht), hint: "via de verloning" },
        ]}
      />

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Panel title="Verdeling over werkvormen">
          <StackBar
            emptyText="Nog geen fiscale profielen ingevuld."
            segments={[
              { label: "Zzp'ers", value: counts.zzp, slot: 1 },
              { label: "Flexwerkers", value: counts.flexwerker, slot: 3 },
              { label: "Uitzendkrachten", value: counts.uitzendkracht, slot: 7 },
            ]}
          />
        </Panel>
        <Panel title="Klaar voor facturatie en verloning">
          <Meter label="Compleet ingevuld" value={counts.complete} max={counts.total} display={`${count(counts.complete)} van ${count(counts.total)}`} tone={counts.complete === counts.total ? "ok" : "warn"} />
        </Panel>
      </div>

      <Panel flush title="Alle profielen">
        <DataTable
          columns={[
            { key: "name", label: "Naam" },
            { key: "kind", label: "Werkvorm" },
            { key: "vat", label: "Btw-nummer", sortable: false },
            { key: "mode", label: "Facturatie", hideOnMobile: true },
            { key: "status", label: "Status" },
          ]}
          rows={rows}
          pageSize={20}
          searchPlaceholder="Zoek op naam of e-mail"
          csvName="werkvormen"
          filters={[
            { key: "kind", label: "Werkvorm", chips: true, options: Object.entries(KIND).map(([value, label]) => ({ value, label })) },
            { key: "complete", label: "Status", options: [{ value: "no", label: "Onvolledig" }, { value: "yes", label: "Compleet" }] },
          ]}
          emptyText="Nog geen fiscale profielen ingevuld."
        />
      </Panel>
    </div>
  );
}
