"use client";

import { useCallback, useEffect, useState } from "react";
import { count, dateTimeNl, euro, percentOf } from "@/lib/admin/format";
import { Empty, Feed, KpiStrip, NameCell, PageHead, Panel, Pill, StackBar, type Tone } from "@/components/admin/kit";
import { DataTable, InlineAsk, type TableRow } from "@/components/admin/kit-client";

interface Worker {
  userId: string;
  name: string;
  email: string | null;
  weeksWorked: number;
  phase: "A" | "B" | "C";
  lastWeek: string;
  lastWeekGrossCents: number;
  lastWeekHours: number;
}
interface Signal {
  userId: string;
  name: string;
  level: "info" | "warn";
  text: string;
}
interface Econ {
  tenantId: string;
  name: string;
  invoices: number;
  hours: number;
  revenueCents: number;
  wageCents: number;
  markupCents: number;
  markupRate: number;
}
interface Lead {
  id: string;
  companyName: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  status: string;
  notes: string | null;
  createdAt: string;
}
interface Client {
  tenantId: string;
  tenantName: string;
  shiftCount: number;
  openPositions: number;
  filledPositions: number;
  nextShiftAt: string | null;
}
interface Data {
  leads: Lead[];
  clients: Client[];
  pool: Worker[];
  signals: Signal[];
  economics: Econ[];
  defaultMarkup: number;
}

const LEAD_STATUS: Record<string, { label: string; tone: Tone }> = {
  NEW: { label: "Nieuw", tone: "warn" },
  ENRICHED: { label: "Nieuw", tone: "warn" },
  SENT: { label: "Uitgenodigd", tone: "plan" },
  REPLIED: { label: "In gesprek", tone: "plan" },
  WON: { label: "Klant", tone: "ok" },
  LOST: { label: "Verloren", tone: "neutral" },
  DISQUALIFIED: { label: "Afgewezen", tone: "neutral" },
};

/** /admin/uitzendbureau — ABU signals, the pool, numbers per client and the aanvragen pipeline. */
export function UitzendConsole() {
  const [d, setD] = useState<Data | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/uitzendbureau", { cache: "no-store" }).catch(() => null);
    if (r?.ok) setD(await r.json());
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function post(url: string, body: unknown, ok: string) {
    setNote(null);
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: body === undefined ? null : JSON.stringify(body) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setNote(r?.ok ? { ok: true, text: ok } : { ok: false, text: j?.error?.message ?? "Dat lukte niet." });
    void load();
  }

  const head = <PageHead title="Uitzendbureau" subtitle="Bedrijven die personeel via het ZekerFlex-uitzendbureau afnemen, van eerste aanvraag tot actieve klant." />;

  if (!d) {
    return (
      <div className="space-y-4">
        {head}
        <div className="a-panel h-28 animate-pulse" />
      </div>
    );
  }

  const totals = d.economics.reduce((s, e) => ({ rev: s.rev + e.revenueCents, wage: s.wage + e.wageCents, markup: s.markup + e.markupCents, hours: s.hours + e.hours }), { rev: 0, wage: 0, markup: 0, hours: 0 });
  const open = d.clients.reduce((n, c) => n + c.openPositions, 0);
  const filled = d.clients.reduce((n, c) => n + c.filledPositions, 0);
  const phaseCount = (p: Worker["phase"]) => d.pool.filter((w) => w.phase === p).length;
  const openLeads = d.leads.filter((l) => !["WON", "LOST", "DISQUALIFIED"].includes(l.status));

  const clientRows: TableRow[] = d.clients.map((c) => ({
    id: c.tenantId,
    href: `/admin/bedrijven/${c.tenantId}`,
    search: c.tenantName,
    cells: {
      name: <NameCell name={c.tenantName} sub={`${c.shiftCount} ${c.shiftCount === 1 ? "klus" : "klussen"}`} />,
      filled: count(c.filledPositions),
      open: c.openPositions > 0 ? <span style={{ color: "var(--a-warn)", fontWeight: 500 }}>{count(c.openPositions)}</span> : "0",
      next: c.nextShiftAt ? dateTimeNl(c.nextShiftAt) : "—",
    },
    sort: { name: c.tenantName, filled: c.filledPositions, open: c.openPositions, next: c.nextShiftAt ? new Date(c.nextShiftAt).getTime() : null },
  }));

  const econRows: TableRow[] = d.economics.map((e) => ({
    id: e.tenantId,
    search: e.name,
    cells: {
      name: <span className="font-medium" style={{ color: "var(--a-text)" }}>{e.name}</span>,
      hours: e.hours.toLocaleString("nl-NL"),
      wage: euro(e.wageCents),
      markup: euro(e.markupCents),
      revenue: <span className="font-medium" style={{ color: "var(--a-text)" }}>{euro(e.revenueCents)}</span>,
      rate: (
        <InlineAsk
          label={`${Math.round(e.markupRate * 100)}%`}
          question={`Opslag voor ${e.name} in % (leeg = standaard ${Math.round(d.defaultMarkup * 100)}%)`}
          initial={String(Math.round(e.markupRate * 100))}
          inputMode="decimal"
          onSubmit={(v) => post("/api/admin/uitzendbureau", { action: "markup", tenantId: e.tenantId, rate: v ? Number(v.replace(",", ".")) / 100 : null }, "Opslag opgeslagen. Dit geldt voor nieuwe goedkeuringen.")}
        />
      ),
    },
    sort: { name: e.name, hours: e.hours, wage: e.wageCents, markup: e.markupCents, revenue: e.revenueCents, rate: e.markupRate },
    csv: { name: e.name, hours: e.hours, wage: (e.wageCents / 100).toFixed(2), markup: (e.markupCents / 100).toFixed(2), revenue: (e.revenueCents / 100).toFixed(2), rate: Math.round(e.markupRate * 100) },
  }));

  const poolRows: TableRow[] = d.pool.map((w) => ({
    id: w.userId,
    href: `/admin/gebruikers/${w.userId}`,
    search: `${w.name} ${w.email ?? ""}`,
    filters: { phase: w.phase },
    cells: {
      name: <NameCell name={w.name} {...(w.email ? { sub: w.email } : {})} />,
      phase: <Pill tone={w.phase === "A" ? "neutral" : w.phase === "B" ? "plan" : "warn"}>Fase {w.phase}</Pill>,
      weeks: count(w.weeksWorked),
      lastWeek: w.lastWeek,
      hours: count(w.lastWeekHours),
      gross: euro(w.lastWeekGrossCents),
    },
    sort: { name: w.name, phase: w.phase, weeks: w.weeksWorked, lastWeek: w.lastWeek, hours: w.lastWeekHours, gross: w.lastWeekGrossCents },
  }));

  return (
    <div className="space-y-4">
      {head}

      {note && (
        <Panel>
          <p role="status" className="text-[0.8125rem]" style={{ color: note.ok ? "var(--a-ok)" : "var(--a-crit)" }}>{note.text}</p>
        </Panel>
      )}

      <KpiStrip
        items={[
          { label: "Omzet deze maand", value: euro(totals.rev), hint: `${totals.hours.toLocaleString("nl-NL")} uur` },
          { label: "Opslag deze maand", value: euro(totals.markup), hint: totals.rev > 0 ? `${percentOf(totals.markup, totals.rev)}% van de omzet` : "nog geen omzet", tone: "money" },
          { label: "Actieve klanten", value: count(d.clients.length), hint: `${count(openLeads.length)} open aanvragen` },
          { label: "Open plekken", value: count(open), hint: `${count(filled)} bezet`, ...(open > 0 ? { tone: "warn" as const } : {}) },
          { label: "Uitzendkrachten", value: count(d.pool.length), hint: "in de recente verloningen" },
        ]}
      />

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <Panel title="Actie nodig" subtitle="ABU-drempels die binnen enkele weken bereikt worden" className="lg:col-span-1">
          <Feed
            emptyText="Geen naderende drempels."
            items={d.signals.map((s, i) => ({ key: `${s.userId}-${i}`, text: <><strong className="font-medium">{s.name}</strong>: {s.text}</>, tone: s.level === "warn" ? "warn" as const : "plan" as const, href: `/admin/gebruikers/${s.userId}` }))}
          />
        </Panel>
        <Panel title="Kosten en opslag" subtitle="Deze maand: wat loon is en wat bij ZekerFlex blijft" className="lg:col-span-1">
          <StackBar
            format={euro}
            emptyText="Nog geen uitzendfacturen deze maand."
            segments={[
              { label: "Loonkosten", value: totals.wage, slot: 3 },
              { label: "Opslag", value: totals.markup, slot: 1 },
            ]}
          />
        </Panel>
        <Panel title="Fasen in de pool" subtitle="Hoe ver uitzendkrachten in de ABU-cao zijn" className="lg:col-span-1">
          <StackBar
            emptyText="Nog geen uitzendkrachten in de recente verloningen."
            segments={[
              { label: "Fase A", value: phaseCount("A"), slot: 1 },
              { label: "Fase B", value: phaseCount("B"), slot: 3 },
              { label: "Fase C", value: phaseCount("C"), slot: 4 },
            ]}
          />
        </Panel>
      </div>

      <Panel flush title="Actieve klanten" subtitle="Bedrijven met minstens één klus via het uitzendbureau">
        <DataTable
          columns={[
            { key: "name", label: "Bedrijf" },
            { key: "filled", label: "Bezet", align: "right" },
            { key: "open", label: "Open", align: "right" },
            { key: "next", label: "Eerstvolgende", hideOnMobile: true },
          ]}
          rows={clientRows}
          pageSize={10}
          defaultSort={{ key: "open", dir: "desc" }}
          emptyText="Nog geen klussen met het uitzendbureau-vinkje."
        />
      </Panel>

      <Panel flush title="Cijfers per klant" subtitle="Deze maand. Opslag is wat ZekerFlex bovenop het loon factureert, vóór werkgeverslasten zoals vakantiegeld, premies en pensioen.">
        <DataTable
          columns={[
            { key: "name", label: "Klant" },
            { key: "hours", label: "Uren", align: "right" },
            { key: "wage", label: "Loonkosten", align: "right", hideOnMobile: true },
            { key: "markup", label: "Opslag", align: "right", hideOnMobile: true },
            { key: "revenue", label: "Omzet", align: "right" },
            { key: "rate", label: "Opslag %", align: "right" },
          ]}
          rows={econRows}
          pageSize={10}
          csvName="uitzend-per-klant"
          defaultSort={{ key: "revenue", dir: "desc" }}
          emptyText="Nog geen uitzendfacturen deze maand."
        />
      </Panel>

      <Panel flush title="Uitzendkrachten" subtitle={`${count(d.pool.length)} in de recente verloningen`}>
        <DataTable
          columns={[
            { key: "name", label: "Naam" },
            { key: "phase", label: "Fase" },
            { key: "weeks", label: "Weken", align: "right" },
            { key: "lastWeek", label: "Laatste week", hideOnMobile: true },
            { key: "hours", label: "Uren", align: "right", hideOnMobile: true },
            { key: "gross", label: "Bruto", align: "right", hideOnMobile: true },
          ]}
          rows={poolRows}
          pageSize={15}
          searchPlaceholder="Zoek op naam"
          filters={[{ key: "phase", label: "Fase", chips: true, options: [{ value: "A", label: "Fase A" }, { value: "B", label: "Fase B" }, { value: "C", label: "Fase C" }] }]}
          defaultSort={{ key: "weeks", dir: "desc" }}
          emptyText="Nog geen uitzendkrachten in de recente verloningen."
        />
      </Panel>

      <Panel flush title="Aanvragen" subtitle={`${count(d.leads.length)} via /uitzendbureau, ${count(openLeads.length)} staan open`}>
        {d.leads.length === 0 ? (
          <Empty title="Nog geen aanvragen" body="Aanvragen via /uitzendbureau komen hier binnen." />
        ) : (
          <ul>
            {d.leads.map((l) => {
              const status = LEAD_STATUS[l.status] ?? { label: l.status.toLowerCase(), tone: "neutral" as const };
              return (
                <li key={l.id} className="px-4 py-3 sm:px-5" style={{ borderTop: "1px solid var(--a-border)" }}>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <span className="text-[0.8125rem] font-medium" style={{ color: "var(--a-text)" }}>{l.companyName}</span>
                    <Pill tone={status.tone}>{status.label}</Pill>
                    <span className="ml-auto flex flex-wrap justify-end gap-1.5">
                      {l.contactEmail && !["WON", "LOST", "DISQUALIFIED"].includes(l.status) && (
                        <button type="button" className="a-button text-xs" onClick={() => post(`/api/sales/leads/${l.id}/invite`, undefined, `Account-uitnodiging verstuurd naar ${l.contactEmail}.`)}>Account sturen</button>
                      )}
                      {!["REPLIED", "WON", "LOST", "DISQUALIFIED"].includes(l.status) && (
                        <button type="button" className="a-button text-xs" onClick={() => post("/api/admin/uitzendbureau", { action: "lead-status", leadId: l.id, status: "REPLIED" }, "Op in gesprek gezet.")}>In gesprek</button>
                      )}
                      {l.status !== "WON" && (
                        <button type="button" className="a-button text-xs" onClick={() => post("/api/admin/uitzendbureau", { action: "lead-status", leadId: l.id, status: "WON" }, `${l.companyName} is klant.`)}>Gewonnen</button>
                      )}
                      {!["LOST", "WON"].includes(l.status) && (
                        <InlineAsk
                          label="Verloren"
                          question="Waarom verloren? (optioneel)"
                          submitLabel="Op verloren zetten"
                          onSubmit={(n) => post("/api/admin/uitzendbureau", { action: "lead-status", leadId: l.id, status: "LOST", ...(n ? { note: n } : {}) }, "Op verloren gezet.")}
                        />
                      )}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs" style={{ color: "var(--a-mute)" }}>
                    {[l.contactName, l.contactEmail, l.contactPhone, dateTimeNl(l.createdAt)].filter(Boolean).join(", ")}
                  </p>
                  {l.notes && <p className="mt-1.5 whitespace-pre-wrap text-xs" style={{ color: "var(--a-dim)" }}>{l.notes}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
