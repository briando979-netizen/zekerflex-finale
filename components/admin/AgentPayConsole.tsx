"use client";

import { useEffect, useState } from "react";

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

const euro = (c: number) => `€ ${(c / 100).toFixed(2).replace(".", ",")}`;
const inp = "w-full rounded-lg border border-hairstrong bg-white px-3 py-2 text-sm";
const STATUS_LABEL: Record<Status, string> = { PENDING: "wacht op goedkeuring", APPROVED: "goedgekeurd", REJECTED: "afgewezen", EXECUTED: "uitgevoerd", FAILED: "mislukt" };

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
      setMsg(res.ok ? `${d.created ?? 0} voorstel(len) toegevoegd (lage voorraad).` : "Voorstellen maken mislukt.");
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

  if (!data || !capsForm) return <div className="h-48 animate-pulse rounded-2xl bg-paper-soft" />;

  const pending = data.intents.filter((i) => i.status === "PENDING");
  const history = data.intents.filter((i) => i.status !== "PENDING").slice(0, 30);

  return (
    <div className="space-y-6">
      {/* caps + noodknop */}
      <div className="card space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-ink">Limieten &amp; noodknop</p>
          <span className="text-xs text-neutralx-500">Vandaag uitgevoerd: {euro(data.spentTodayCents)}</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutralx-500">Max per betaling (€)</label>
            <input className={inp} type="number" min={0} value={capsForm.maxPerIntentCents / 100} onChange={(e) => setCapsForm({ ...capsForm, maxPerIntentCents: Math.round(Number(e.target.value) * 100) })} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutralx-500">Max per dag (€)</label>
            <input className={inp} type="number" min={0} value={capsForm.maxPerDayCents / 100} onChange={(e) => setCapsForm({ ...capsForm, maxPerDayCents: Math.round(Number(e.target.value) * 100) })} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={capsForm.allowExternal} onChange={(e) => setCapsForm({ ...capsForm, allowExternal: e.target.checked })} /> Betalingen buiten ZekerFlex toestaan</label>
        <label className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${capsForm.killSwitch ? "bg-crit text-white" : "bg-paper-soft text-ink"}`}>
          <input type="checkbox" checked={capsForm.killSwitch} onChange={(e) => setCapsForm({ ...capsForm, killSwitch: e.target.checked })} /> Noodknop — zet ALLE goedkeuren en uitvoeren stil
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={saveCaps} disabled={busy} className="btn-primary text-sm disabled:opacity-50">Limieten opslaan</button>
          <button type="button" onClick={proposeAi} disabled={busy} className="btn-ghost text-sm disabled:opacity-50">AI: stel betalingen voor (lage voorraad)</button>
          {msg && <span className="text-sm text-neutralx-600">{msg}</span>}
        </div>
        <p className="text-xs text-neutralx-400">
          Er wordt nooit echt geld verplaatst zonder jouw goedkeuring. En zelfs ná goedkeuring blijft het bij &ldquo;handmatig uitvoeren&rdquo;
          tot je bewust een betaalrail aansluit (<code>AGENT_PAY_RAIL</code>).
        </p>
      </div>

      {/* wachtrij */}
      <div className="card p-5">
        <p className="text-sm font-semibold text-ink">Wacht op goedkeuring ({pending.length})</p>
        {pending.length === 0 ? (
          <p className="mt-2 text-sm text-neutralx-500">Geen openstaande voorstellen.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {pending.map((i) => (
              <li key={i.id} className="rounded-xl border border-hairstrong p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-ink">{euro(i.amountCents)}</span>
                  <span className="text-sm text-neutralx-600">→ {i.recipient}</span>
                  {i.external && <span className="rounded-full bg-paper-soft px-2 py-0.5 text-[10px] font-semibold text-neutralx-600">extern</span>}
                  <span className="text-[11px] text-neutralx-400">voorgesteld door {i.proposedBy}</span>
                </div>
                <p className="mt-1 text-xs text-neutralx-600">{i.reason}</p>
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={() => void decide(i.id, "approve")} disabled={busy} className="btn-primary text-xs disabled:opacity-50">Goedkeuren</button>
                  <button type="button" onClick={() => void decide(i.id, "reject")} disabled={busy} className="btn-ghost text-xs text-crit disabled:opacity-50">Afwijzen</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* historie */}
      {history.length > 0 && (
        <div className="card p-5">
          <p className="text-sm font-semibold text-ink">Historie</p>
          <ul className="mt-3 divide-y divide-hair text-sm">
            {history.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="font-medium text-ink">{euro(i.amountCents)}</span>
                <span className="text-neutralx-600">→ {i.recipient}</span>
                <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold ${i.status === "EXECUTED" ? "bg-brand-600 text-white" : i.status === "REJECTED" || i.status === "FAILED" ? "bg-crit text-white" : "bg-paper-soft text-neutralx-600"}`}>
                  {STATUS_LABEL[i.status]}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
