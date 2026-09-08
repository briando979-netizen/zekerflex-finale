"use client";

import { useCallback, useState } from "react";
import { APanel, AButton, APill } from "@/components/admin/ui";

export type SourceDto = {
  id: string;
  kind: string;
  url: string | null;
  label: string | null;
  enabled: boolean;
  lastRunAt: string | null;
};

export type CampaignDto = {
  id: string;
  name: string;
  status: string;
  mode: string;
  dailyCap: number;
  minScore: number;
  sendStartHour: number;
  sendEndHour: number;
  workdaysOnly: boolean;
  targetSectors: string[];
  targetCities: string[];
  autopilotEnabledGlobally: boolean;
  leadCount: number;
  sentCount: number;
  repliedCount: number;
  wonCount: number;
  queuedCount: number;
  sources: SourceDto[];
};

const STATUS_TONE: Record<string, "ok" | "warn" | "crit" | "neutral"> = {
  ACTIVE: "ok",
  PAUSED: "warn",
  DRAFT: "neutral",
  DONE: "neutral",
};

function fmt(iso: string | null) {
  return iso ? new Date(iso).toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "nog niet";
}

export function CampaignsTab({ initialCampaigns }: { initialCampaigns: CampaignDto[] }) {
  const [campaigns, setCampaigns] = useState<CampaignDto[]>(initialCampaigns);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  const reload = useCallback(async () => {
    const r = await fetch("/api/admin/sales/campaigns", { cache: "no-store" });
    const d = await r.json();
    if (Array.isArray(d.campaigns)) {
      setCampaigns(
        d.campaigns.map((c: Record<string, unknown>) => ({
          ...(c as unknown as CampaignDto),
          autopilotEnabledGlobally: initialCampaigns[0]?.autopilotEnabledGlobally ?? false,
          leadCount: (c as { _count?: { leads?: number } })._count?.leads ?? 0,
          sentCount: 0,
          repliedCount: 0,
          wonCount: 0,
          queuedCount: 0,
          sources: (c as { sources?: SourceDto[] }).sources ?? [],
        })),
      );
    }
  }, [initialCampaigns]);

  async function act(id: string, body: Record<string, unknown>, label: string) {
    setBusy(`${id}:${label}`);
    setMsg(null);
    try {
      const r = await fetch(`/api/admin/sales/campaigns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) {
        setMsg(d?.error?.message ?? "Actie mislukt.");
        return;
      }
      await reload();
      setMsg("Bijgewerkt.");
    } finally {
      setBusy(null);
    }
  }

  async function runNow(id: string) {
    setBusy(`${id}:run`);
    setMsg(null);
    try {
      const r = await fetch(`/api/admin/sales/campaigns/${id}/run`, { method: "POST" });
      const d = await r.json();
      if (!r.ok) {
        setMsg(d?.error?.message ?? "Draaien mislukt.");
        return;
      }
      const x = d.result ?? {};
      setMsg(
        typeof x.skipped === "string"
          ? `Overgeslagen: ${x.skipped}`
          : `Motor gedraaid: ${x.discovered ?? 0} ontdekt, ${x.scored ?? 0} gescoord, ${x.drafted ?? 0} concept, ${x.sent ?? 0} verzonden${x.skippedSends ? `, ${x.skippedSends} overgeslagen` : ""}.`,
      );
      await reload();
    } finally {
      setBusy(null);
    }
  }

  async function toggleMode(c: CampaignDto) {
    if (c.mode === "REVIEW") {
      const confirm = window.prompt(
        'AUTOPILOT stuurt zelf mails (binnen de dagcap + kantooruren). Typ "AUTOPILOT AAN" om te bevestigen:',
      );
      if (confirm !== "AUTOPILOT AAN") return;
      await act(c.id, { action: "setMode", mode: "AUTOPILOT", confirm }, "mode");
    } else {
      await act(c.id, { action: "setMode", mode: "REVIEW" }, "mode");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: "var(--a-mute)" }}>
          Een campagne bepaalt de doelgroep en de harde limieten waaronder de motor werkt.
        </p>
        <AButton onClick={() => setShowNew((v) => !v)}>Nieuwe campagne</AButton>
      </div>

      {showNew && <NewCampaignForm onCreated={async () => { setShowNew(false); await reload(); }} />}

      {msg && (
        <div className="rounded-xl px-4 py-2.5 text-sm" style={{ background: "var(--a-elev)", color: "var(--a-dim)" }}>
          {msg}
        </div>
      )}

      {campaigns.length === 0 ? (
        <APanel><p className="text-sm" style={{ color: "var(--a-mute)" }}>Nog geen campagnes.</p></APanel>
      ) : (
        campaigns.map((c) => (
          <APanel key={c.id} pad={false}>
            <div className="space-y-3 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold" style={{ color: "var(--a-text)" }}>{c.name}</span>
                <APill tone={STATUS_TONE[c.status] ?? "neutral"}>{c.status}</APill>
                <APill tone={c.mode === "AUTOPILOT" ? "warn" : "neutral"}>{c.mode}</APill>
              </div>

              <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs" style={{ color: "var(--a-mute)" }}>
                <span>{c.leadCount} leads</span>
                <span>{c.sentCount} verstuurd</span>
                <span>{c.repliedCount} reacties</span>
                <span>{c.wonCount} gewonnen</span>
                <span>fit ≥ {c.minScore}</span>
                <span>dagcap {c.dailyCap}</span>
                <span>{c.sendStartHour}:00–{c.sendEndHour}:00{c.workdaysOnly ? " · werkdagen" : ""}</span>
              </div>

              {(c.targetSectors.length > 0 || c.targetCities.length > 0) && (
                <p className="text-xs" style={{ color: "var(--a-mute)" }}>
                  {[c.targetSectors.join(", "), c.targetCities.join(", ")].filter(Boolean).join(" · ")}
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                {c.status !== "ACTIVE" ? (
                  <Btn label="Activeren" onClick={() => act(c.id, { action: "activate" }, "activate")} busy={busy === `${c.id}:activate`} />
                ) : (
                  <Btn label="Pauzeren" onClick={() => act(c.id, { action: "pause" }, "pause")} busy={busy === `${c.id}:pause`} />
                )}
                <Btn
                  label={c.mode === "REVIEW" ? "Zet op AUTOPILOT" : "Terug naar REVIEW"}
                  onClick={() => toggleMode(c)}
                  busy={busy === `${c.id}:mode`}
                  disabled={c.mode === "REVIEW" && !c.autopilotEnabledGlobally}
                  hint={c.mode === "REVIEW" && !c.autopilotEnabledGlobally ? "SALES_AUTOPILOT_ENABLED staat uit" : undefined}
                />
                <Btn label="Nu draaien" primary onClick={() => runNow(c.id)} busy={busy === `${c.id}:run`} />
              </div>

              <SourcesEditor campaign={c} onChange={reload} />
            </div>
          </APanel>
        ))
      )}
    </div>
  );
}

function Btn({
  label, onClick, busy, primary, disabled, hint,
}: { label: string; onClick: () => void; busy?: boolean; primary?: boolean; disabled?: boolean; hint?: string | undefined }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || disabled}
      title={hint}
      className="rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40"
      style={{
        background: primary ? "var(--a-accent)" : "var(--a-panel)",
        color: primary ? "#04140d" : "var(--a-dim)",
        border: "1px solid var(--a-border)",
      }}
    >
      {busy ? "Bezig…" : label}
    </button>
  );
}

function SourcesEditor({ campaign, onChange }: { campaign: CampaignDto; onChange: () => Promise<void> }) {
  const [url, setUrl] = useState("");
  const [csv, setCsv] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function addCareers() {
    if (!url.trim()) return;
    setBusy(true);
    try {
      const r = await fetch("/api/admin/sales/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: campaign.id, kind: "CAREERS_URL", url: url.trim() }),
      });
      const d = await r.json();
      setNote(r.ok ? "Careers-bron toegevoegd." : d?.error?.message ?? "Mislukt.");
      if (r.ok) { setUrl(""); await onChange(); }
    } finally {
      setBusy(false);
    }
  }

  async function removeSource(id: string) {
    await fetch("/api/admin/sales/sources", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await onChange();
  }

  async function importCsv() {
    if (csv.trim().length < 10) return;
    setBusy(true);
    try {
      const r = await fetch("/api/admin/sales/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: campaign.id, csv }),
      });
      const d = await r.json();
      if (r.ok) {
        setNote(`Import: ${d.result.created} aangemaakt, ${d.result.skipped} overgeslagen.`);
        setCsv("");
        await onChange();
      } else {
        setNote(d?.error?.message ?? "Import mislukt.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl p-3" style={{ background: "var(--a-panel-2)", border: "1px solid var(--a-border)" }}>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--a-mute)" }}>Vindbronnen</p>

      <ul className="mb-2 space-y-1 text-xs" style={{ color: "var(--a-dim)" }}>
        <li>KVKBase: automatisch op sector/plaats (elke 6 uur)</li>
        {campaign.sources.map((s) => (
          <li key={s.id} className="flex items-center gap-2">
            <span>{s.kind === "CAREERS_URL" ? "Careers" : s.kind}: {s.url ?? s.label ?? "—"} · laatst {fmt(s.lastRunAt)}</span>
            <button type="button" onClick={() => removeSource(s.id)} className="text-[10px] underline" style={{ color: "var(--a-mute)" }}>verwijder</button>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://bedrijf.nl/werken-bij"
          className="min-w-[220px] flex-1 rounded-lg px-3 py-1.5 text-xs"
          style={{ background: "var(--a-panel)", color: "var(--a-text)", border: "1px solid var(--a-border)" }}
        />
        <Btn label="+ Careers-URL" onClick={addCareers} busy={busy} />
      </div>

      <details className="mt-2">
        <summary className="cursor-pointer text-xs" style={{ color: "var(--a-mute)" }}>CSV importeren</summary>
        <textarea
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          rows={4}
          placeholder="companyName,email,city,sector,vacature"
          className="mt-2 w-full rounded-lg px-3 py-2 text-xs font-mono"
          style={{ background: "var(--a-panel)", color: "var(--a-text)", border: "1px solid var(--a-border)" }}
        />
        <Btn label="Importeer CSV" onClick={importCsv} busy={busy} />
      </details>

      {note && <p className="mt-2 text-xs" style={{ color: "var(--a-mute)" }}>{note}</p>}
    </div>
  );
}

function NewCampaignForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const [form, setForm] = useState({ name: "", sectors: "", cities: "", minScore: "55", dailyCap: "40" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/admin/sales/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          targetSectors: form.sectors.split(",").map((s) => s.trim()).filter(Boolean),
          targetCities: form.cities.split(",").map((s) => s.trim()).filter(Boolean),
          minScore: Number(form.minScore) || 55,
          dailyCap: Number(form.dailyCap) || 40,
        }),
      });
      const d = await r.json();
      if (!r.ok) { setErr(d?.error?.message ?? "Aanmaken mislukt."); return; }
      await onCreated();
    } finally {
      setBusy(false);
    }
  }

  const field = (label: string, k: keyof typeof form, ph?: string) => (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wide" style={{ color: "var(--a-mute)" }}>{label}</span>
      <input
        value={form[k]}
        onChange={(e) => set(k, e.target.value)}
        placeholder={ph}
        className="mt-1 w-full rounded-lg px-3 py-2 text-sm"
        style={{ background: "var(--a-panel-2)", color: "var(--a-text)", border: "1px solid var(--a-border)" }}
      />
    </label>
  );

  return (
    <APanel title="Nieuwe campagne" subtitle="Start in REVIEW-modus — niets wordt automatisch verstuurd">
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        {field("Naam *", "name", "Horeca & Logistiek Randstad")}
        {field("Sectoren (komma)", "sectors", "horeca, logistiek")}
        {field("Plaatsen (komma)", "cities", "Amsterdam, Utrecht")}
        {field("Min. fit-score", "minScore")}
        {field("Dagcap", "dailyCap")}
        {err && <p className="text-xs sm:col-span-2" style={{ color: "#fca5a5" }}>{err}</p>}
        <div className="sm:col-span-2">
          <AButton type="submit" disabled={busy || form.name.trim().length < 2}>{busy ? "Bezig…" : "Campagne aanmaken"}</AButton>
        </div>
      </form>
    </APanel>
  );
}
