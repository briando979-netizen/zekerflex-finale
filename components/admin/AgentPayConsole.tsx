"use client";

import { useEffect, useState } from "react";
import { count, dateTimeNl, euroExact } from "@/lib/admin/format";
import { Empty, KpiStrip, Meter, Notice, Panel, Pill, type Tone } from "@/components/admin/kit";
import { DataTable, type TableRow } from "@/components/admin/kit-client";

type Status = "PENDING" | "APPROVED" | "REJECTED" | "EXECUTED" | "FAILED";
interface Intent {
  id: string;
  amountCents: number;
  recipient: string;
  external: boolean;
  reason: string;
  proposedBy: string;
  status: Status;
  createdAt: string;
  note?: string;
}
interface Caps {
  maxPerIntentCents: number;
  maxPerDayCents: number;
  allowExternal: boolean;
  killSwitch: boolean;
}
interface Data {
  intents: Intent[];
  caps: Caps;
  spentTodayCents: number;
}

const STATUS: Record<Status, { label: string; tone: Tone }> = {
  PENDING: { label: "Wacht op goedkeuring", tone: "warn" },
  APPROVED: { label: "Goedgekeurd", tone: "plan" },
  REJECTED: { label: "Afgewezen", tone: "neutral" },
  EXECUTED: { label: "Uitgevoerd", tone: "ok" },
  FAILED: { label: "Mislukt", tone: "crit" },
};

export function AgentPayConsole() {
  const [data, setData] = useState<Data | null>(null);
  const [capsForm, setCapsForm] = useState<Caps | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/agent-pay", { cache: "no-store" }).catch(() => null);
    if (res?.ok) {
      const d = (await res.json()) as Data;
      setData(d);
      setCapsForm(d.caps);
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function saveCaps() {
    if (!capsForm) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/agent-pay", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(capsForm) });
      setMsg(res.ok ? "Limieten opgeslagen." : "Opslaan mislukt.");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function proposeAi() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/agent-pay/propose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ai: true }) });
      const d = await res.json().catch(() => ({}));
      setMsg(res.ok ? `${d.created ?? 0} voorstel(len) toegevoegd op basis van lage voorraad.` : "Voorstellen maken mislukt.");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function decide(id: string, action: "approve" | "reject") {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/agent-pay/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const d = await res.json().catch(() => ({}));
      if (res.ok) setMsg(action === "approve" ? `Goedgekeurd. ${d.rail ?? ""}` : "Afgewezen.");
      else setMsg(d?.error?.message ?? "Actie mislukt.");
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!data || !capsForm) return <div className="a-panel h-48 animate-pulse" />;

  const pending = data.intents.filter((i) => i.status === "PENDING");
  const history = data.intents.filter((i) => i.status !== "PENDING");
  const pendingCents = pending.reduce((s, i) => s + i.amountCents, 0);

  const historyRows: TableRow[] = history.map((i) => ({
    id: i.id,
    search: `${i.recipient} ${i.reason} ${i.proposedBy}`,
    filters: { status: i.status },
    cells: {
      recipient: <span className="font-medium" style={{ color: "var(--a-text)" }}>{i.recipient}</span>,
      reason: <span className="block max-w-[22rem] truncate text-xs" title={i.reason}>{i.reason}</span>,
      when: dateTimeNl(i.createdAt),
      amount: <span className="font-medium" style={{ color: "var(--a-text)" }}>{euroExact(i.amountCents)}</span>,
      status: <Pill tone={STATUS[i.status].tone}>{STATUS[i.status].label}</Pill>,
    },
    sort: { recipient: i.recipient, when: new Date(i.createdAt).getTime(), amount: i.amountCents, status: STATUS[i.status].label },
  }));

  return (
    <div className="space-y-4">
      {capsForm.killSwitch && <Notice tone="crit" role="alert">De noodknop staat aan: goedkeuren en uitvoeren liggen stil.</Notice>}
      {msg && <Notice>{msg}</Notice>}

      <KpiStrip
        items={[
          { label: "Wacht op goedkeuring", value: count(pending.length), hint: pending.length > 0 ? `${euroExact(pendingCents)} in totaal` : "niets openstaand", ...(pending.length > 0 ? { tone: "warn" as const } : {}) },
          { label: "Vandaag uitgevoerd", value: euroExact(data.spentTodayCents), hint: `van ${euroExact(data.caps.maxPerDayCents)} per dag` },
          { label: "Max per betaling", value: euroExact(data.caps.maxPerIntentCents), hint: data.caps.allowExternal ? "ook buiten ZekerFlex" : "alleen binnen ZekerFlex" },
          { label: "Noodknop", value: data.caps.killSwitch ? "Aan" : "Uit", hint: data.caps.killSwitch ? "alles staat stil" : "betalingen kunnen door", ...(data.caps.killSwitch ? { tone: "crit" as const } : {}) },
        ]}
      />

      <div className="grid items-start gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Panel
          flush
          title="Wacht op goedkeuring"
          subtitle="Er verplaatst nooit geld zonder jouw tik"
          actions={<button type="button" onClick={() => void proposeAi()} disabled={busy} className="a-button text-xs">AI: stel betalingen voor</button>}
        >
          {pending.length === 0 ? (
            <Empty title="Geen openstaande voorstellen" body="Laat de AI voorstellen doen op basis van lage voorraad, of wacht tot er iets binnenkomt." />
          ) : (
            <ul>
              {pending.map((i) => (
                <li key={i.id} className="px-4 py-3 text-[0.8125rem] sm:px-5" style={{ borderTop: "1px solid var(--a-border)" }}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="num font-semibold" style={{ color: "var(--a-text)" }}>{euroExact(i.amountCents)}</span>
                    <span style={{ color: "var(--a-dim)" }}>aan {i.recipient}</span>
                    {i.external && <Pill tone="warn">Extern</Pill>}
                    <span className="ml-auto text-xs" style={{ color: "var(--a-mute)" }}>voorgesteld door {i.proposedBy}</span>
                  </div>
                  <p className="mt-1 text-xs" style={{ color: "var(--a-dim)" }}>{i.reason}</p>
                  <div className="mt-2 flex gap-1.5">
                    <button type="button" onClick={() => void decide(i.id, "approve")} disabled={busy} className="a-button a-button-primary text-xs">Goedkeuren</button>
                    <button type="button" onClick={() => void decide(i.id, "reject")} disabled={busy} className="a-button text-xs">Afwijzen</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Limieten & noodknop"
          subtitle="Zelfs na goedkeuring blijft het bij handmatig uitvoeren, tot je bewust een betaalrail aansluit (AGENT_PAY_RAIL)."
          footer={<button type="button" onClick={() => void saveCaps()} disabled={busy} className="a-button a-button-primary">Limieten opslaan</button>}
        >
          <div className="space-y-3">
            <Meter label="Vandaag gebruikt" value={data.spentTodayCents} max={data.caps.maxPerDayCents} display={`${euroExact(data.spentTodayCents)} van ${euroExact(data.caps.maxPerDayCents)}`} tone={data.spentTodayCents >= data.caps.maxPerDayCents ? "crit" : "ok"} />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="a-label">Max per betaling (€)<input className="a-input" type="number" min={0} value={capsForm.maxPerIntentCents / 100} onChange={(e) => setCapsForm({ ...capsForm, maxPerIntentCents: Math.round(Number(e.target.value) * 100) })} /></label>
              <label className="a-label">Max per dag (€)<input className="a-input" type="number" min={0} value={capsForm.maxPerDayCents / 100} onChange={(e) => setCapsForm({ ...capsForm, maxPerDayCents: Math.round(Number(e.target.value) * 100) })} /></label>
            </div>
            <label className="flex items-center gap-2 text-[0.8125rem]" style={{ color: "var(--a-text)" }}>
              <input type="checkbox" checked={capsForm.allowExternal} onChange={(e) => setCapsForm({ ...capsForm, allowExternal: e.target.checked })} /> Betalingen buiten ZekerFlex toestaan
            </label>
            <label className="flex items-center gap-2 rounded-lg px-3 py-2 text-[0.8125rem] font-medium" style={capsForm.killSwitch ? { background: "var(--a-crit-soft)", color: "var(--a-crit)" } : { background: "var(--a-panel-2)", color: "var(--a-text)" }}>
              <input type="checkbox" checked={capsForm.killSwitch} onChange={(e) => setCapsForm({ ...capsForm, killSwitch: e.target.checked })} /> Noodknop: zet al het goedkeuren en uitvoeren stil
            </label>
          </div>
        </Panel>
      </div>

      <Panel flush title="Historie" subtitle={`${count(history.length)} eerder behandeld`}>
        <DataTable
          columns={[
            { key: "recipient", label: "Aan" },
            { key: "reason", label: "Waarvoor", hideOnMobile: true, sortable: false },
            { key: "when", label: "Moment", hideOnMobile: true },
            { key: "amount", label: "Bedrag", align: "right" },
            { key: "status", label: "Status" },
          ]}
          rows={historyRows}
          pageSize={10}
          searchPlaceholder="Zoek op ontvanger of reden"
          filters={[{ key: "status", label: "Status", chips: true, options: (["EXECUTED", "APPROVED", "REJECTED", "FAILED"] as Status[]).map((value) => ({ value, label: STATUS[value].label })) }]}
          defaultSort={{ key: "when", dir: "desc" }}
          emptyText="Nog niets behandeld."
        />
      </Panel>
    </div>
  );
}
