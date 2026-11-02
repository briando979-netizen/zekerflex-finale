"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { count, dateTimeNl, percentOf } from "@/lib/admin/format";
import { bucketCount, resolvePeriod, timelineKeys } from "@/lib/admin/period";
import { Empty, KpiStrip, Notice, PageHead, Panel, Pill, type Tone } from "@/components/admin/kit";
import { Chart } from "@/components/admin/kit-client";

interface CallTurn {
  at: string;
  who: "ai" | "beller";
  text: string;
}
interface CallRecord {
  id: string;
  at: string;
  direction: "outbound" | "inbound";
  toNumber: string;
  fromNumber: string;
  status: string;
  script: string;
  recordingUrl?: string;
  transcript: CallTurn[];
  outcome?: { interested: boolean; summary: string; callbackNote?: string };
}
interface Data {
  configured: boolean;
  allowB2bCold: boolean;
  scripts: { id: string; label: string }[];
  calls: CallRecord[];
}

const STATUS: Record<string, { label: string; tone: Tone }> = {
  completed: { label: "Gesproken", tone: "ok" },
  "in-progress": { label: "Bezig", tone: "plan" },
  ringing: { label: "Gaat over", tone: "plan" },
  queued: { label: "In de rij", tone: "neutral" },
  "no-answer": { label: "Niet opgenomen", tone: "warn" },
  busy: { label: "In gesprek", tone: "warn" },
  failed: { label: "Mislukt", tone: "crit" },
  mock: { label: "Test", tone: "neutral" },
};

type Filter = "all" | "inbound" | "outbound" | "interested";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Alle" },
  { id: "interested", label: "Opvolgen" },
  { id: "inbound", label: "Inkomend" },
  { id: "outbound", label: "Uitgaand" },
];

const PERIOD = resolvePeriod("30");

export function Beller() {
  const [data, setData] = useState<Data | null>(null);
  const [to, setTo] = useState("");
  const [script, setScript] = useState("intro-werkgever");
  const [b2b, setB2b] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [consentNum, setConsentNum] = useState("");
  const [consentMsg, setConsentMsg] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/telephony", { cache: "no-store" });
      if (res.ok) setData(await res.json());
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const placeCall = useCallback(async () => {
    if (!to.trim() || placing) return;
    setPlacing(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/telephony", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "call", to: to.trim(), script, b2b }),
      });
      const d = await res.json().catch(() => ({}));
      setMsg({ ok: Boolean(d.ok), text: d.reason ?? d.error?.message ?? (d.ok ? "Oproep geplaatst." : "Mislukt.") });
      await load();
    } catch {
      setMsg({ ok: false, text: "Netwerkfout." });
    } finally {
      setPlacing(false);
    }
  }, [to, script, b2b, placing, load]);

  const consent = useCallback(
    async (action: "consent" | "optout") => {
      if (!consentNum.trim()) return;
      setConsentMsg(null);
      try {
        const res = await fetch("/api/admin/telephony", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, number: consentNum.trim() }),
        });
        const d = await res.json().catch(() => ({}));
        setConsentMsg(d.message ?? d.error?.message ?? "Klaar.");
      } catch {
        setConsentMsg("Netwerkfout.");
      }
    },
    [consentNum],
  );

  const calls = useMemo(() => data?.calls ?? [], [data]);
  const shown = useMemo(() => {
    const q = query.replace(/\s/g, "").toLowerCase();
    return calls.filter((c) => {
      if (filter === "inbound" && c.direction !== "inbound") return false;
      if (filter === "outbound" && c.direction !== "outbound") return false;
      if (filter === "interested" && !c.outcome?.interested) return false;
      if (q && !`${c.toNumber}${c.fromNumber}${c.outcome?.summary ?? ""}`.replace(/\s/g, "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [calls, filter, query]);

  const inbound = calls.filter((c) => c.direction === "inbound");
  const outbound = calls.filter((c) => c.direction === "outbound");
  const talked = calls.filter((c) => c.transcript.length > 1);
  const interested = calls.filter((c) => c.outcome?.interested);
  const filterCount = (f: Filter) => (f === "all" ? calls.length : f === "inbound" ? inbound.length : f === "outbound" ? outbound.length : interested.length);

  return (
    <div className="space-y-4">
      <PageHead
        title="AI-beller"
        subtitle="Uitgaande gesprekken met een script, inkomende oproepen dag en nacht, met opname en verslag. Handmatig bellen vanuit dit scherm mag altijd: jij bent dan verantwoordelijk. De autonome motor belt koud alleen met vastgelegde toestemming of B2B als dat aanstaat."
        meta={data ? <Pill tone={data.configured ? "ok" : "warn"}>{data.configured ? "Twilio gekoppeld" : "Testmodus"}</Pill> : undefined}
      />

      {data && !data.configured && (
        <Notice tone="warn">
          Er is nog geen Twilio-account gekoppeld. Oproepen worden vastgelegd maar niet echt geplaatst, zodat je scripts kunt testen. Zet TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN en TWILIO_FROM_NUMBER in .env.production om echt te bellen.
        </Notice>
      )}

      <KpiStrip
        items={[
          { label: "Gesprekken", value: count(calls.length), hint: `${count(inbound.length)} inkomend, ${count(outbound.length)} uitgaand`, spark: bucketCount(calls, (c) => new Date(c.at), PERIOD) },
          { label: "Echt gesproken", value: `${percentOf(talked.length, calls.length)}%`, hint: `${count(talked.length)} met een gesprek` },
          { label: "Opvolgen", value: count(interested.length), hint: "met interesse", ...(interested.length > 0 ? { tone: "warn" as const } : {}) },
          { label: "Met opname", value: count(calls.filter((c) => c.recordingUrl).length), hint: "terug te luisteren" },
        ]}
      />

      <div className="grid items-start gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="Gesprekken per dag" subtitle="De laatste 30 dagen">
          <Chart
            title="Inkomende en uitgaande gesprekken per dag"
            kind="bars"
            unit="count"
            labels={timelineKeys(PERIOD)}
            series={[
              { label: "Inkomend", values: bucketCount(inbound, (c) => new Date(c.at), PERIOD), slot: 3 },
              { label: "Uitgaand", values: bucketCount(outbound, (c) => new Date(c.at), PERIOD), slot: 1 },
            ]}
            height={180}
            emptyText="Nog geen gesprekken in de laatste 30 dagen."
          />
        </Panel>
        <div className="space-y-4">
          <Panel title="Bel iemand">
            <div className="space-y-2.5">
              <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="Telefoonnummer, bijvoorbeeld +31612345678" aria-label="Telefoonnummer" className="a-input" />
              <select value={script} onChange={(e) => setScript(e.target.value)} aria-label="Script" className="a-input">
                {(data?.scripts ?? []).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
              <label className="flex items-center gap-2 text-xs" style={{ color: "var(--a-dim)" }}>
                <input type="checkbox" checked={b2b} onChange={(e) => setB2b(e.target.checked)} />
                Dit is een bedrijf (B2B){data && !data.allowB2bCold ? ", koud B2B staat globaal uit" : ""}
              </label>
              <button type="button" onClick={() => void placeCall()} disabled={placing || !to.trim()} className="a-button a-button-primary w-full">{placing ? "Bezig…" : "Nu bellen"}</button>
              {msg && <p role="status" className="text-xs" style={{ color: msg.ok ? "var(--a-ok)" : "var(--a-crit)" }}>{msg.text}</p>}
            </div>
          </Panel>
          <Panel title="Toestemming en niet bellen" subtitle="Leg toestemming vast, of zet een nummer op de niet-bellen-lijst">
            <div className="space-y-2.5">
              <input value={consentNum} onChange={(e) => setConsentNum(e.target.value)} placeholder="Telefoonnummer" aria-label="Telefoonnummer voor toestemming" className="a-input" />
              <div className="flex gap-2">
                <button type="button" onClick={() => void consent("consent")} className="a-button flex-1 text-xs">Toestemming vastleggen</button>
                <button type="button" onClick={() => void consent("optout")} className="a-button flex-1 text-xs" style={{ color: "var(--a-crit)" }}>Niet bellen</button>
              </div>
              {consentMsg && <p role="status" className="text-xs" style={{ color: "var(--a-dim)" }}>{consentMsg}</p>}
            </div>
          </Panel>
        </div>
      </div>

      <Panel flush title="Gesprekken" subtitle="Klik een gesprek open voor het verslag, het transcript en de opname" actions={<button type="button" onClick={() => void load()} className="a-button text-xs">Vernieuwen</button>}>
        <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 sm:px-4" style={{ borderTop: "1px solid var(--a-border)", borderBottom: "1px solid var(--a-border)" }}>
          <div role="group" aria-label="Gesprekken tonen" className="flex gap-0.5">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                aria-pressed={filter === f.id}
                className="rounded-md px-2.5 py-1 text-[0.8125rem] font-medium transition-colors"
                style={filter === f.id ? { background: "var(--a-elev)", color: "var(--a-text)" } : { color: "var(--a-mute)" }}
              >
                {f.label}
                <span className="num ml-1.5 text-xs" style={{ color: "var(--a-mute)" }}>{filterCount(f.id)}</span>
              </button>
            ))}
          </div>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Zoek op nummer of verslag" aria-label="Zoek in gesprekken" className="a-input ml-auto !w-56 !py-1 text-[0.8125rem] max-sm:!w-full" />
        </div>
        {shown.length === 0 ? (
          <Empty title={calls.length === 0 ? "Nog geen gesprekken" : "Geen gesprekken met deze filters"} />
        ) : (
          <ul className="max-h-[40rem] overflow-y-auto">
            {shown.map((c) => {
              const status = STATUS[c.status] ?? { label: c.status, tone: "neutral" as const };
              const isOpen = open === c.id;
              return (
                <li key={c.id} style={{ borderBottom: "1px solid var(--a-border)" }}>
                  <button type="button" onClick={() => setOpen((o) => (o === c.id ? null : c.id))} aria-expanded={isOpen} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-left text-[0.8125rem] transition-colors hover:bg-[var(--a-panel-2)] sm:px-5">
                    <span className="w-20 flex-shrink-0 text-xs font-medium" style={{ color: c.direction === "inbound" ? "var(--a-plan)" : "var(--a-dim)" }}>{c.direction === "inbound" ? "Inkomend" : "Uitgaand"}</span>
                    <span className="font-mono text-xs" style={{ color: "var(--a-text)" }}>{c.direction === "inbound" ? c.fromNumber : c.toNumber}</span>
                    <Pill tone={status.tone}>{status.label}</Pill>
                    {c.outcome?.interested && <Pill tone="warn">Opvolgen</Pill>}
                    <span className="min-w-0 flex-1 truncate text-xs" style={{ color: "var(--a-mute)" }}>{c.outcome?.summary ?? ""}</span>
                    <span className="flex-shrink-0 text-xs" style={{ color: "var(--a-mute)" }}>{dateTimeNl(c.at)}, {c.transcript.length} beurten</span>
                  </button>
                  {isOpen && (
                    <div className="space-y-2 px-4 pb-4 sm:px-5">
                      {c.outcome && (
                        <p className="rounded-lg px-3 py-2 text-xs leading-relaxed" style={{ background: "var(--a-panel-2)", color: "var(--a-dim)" }}>
                          <span className="font-semibold" style={{ color: "var(--a-text)" }}>{c.outcome.interested ? "Opvolgen" : "Uitkomst"}:</span> {c.outcome.summary}
                          {c.outcome.callbackNote ? ` Terugbellen: ${c.outcome.callbackNote}.` : ""}
                        </p>
                      )}
                      <div className="space-y-1.5">
                        {c.transcript.map((t, i) => (
                          <p key={i} className="flex gap-2 text-xs leading-relaxed">
                            <span className="w-12 flex-shrink-0 font-semibold" style={{ color: t.who === "ai" ? "var(--a-accent-ink)" : "var(--a-text)" }}>{t.who === "ai" ? "AI" : "Beller"}</span>
                            <span style={{ color: "var(--a-dim)" }}>{t.text}</span>
                          </p>
                        ))}
                      </div>
                      {c.recordingUrl && (
                        <div className="pt-1">
                          <span className="mb-1 block text-xs font-medium" style={{ color: "var(--a-mute)" }}>Opname</span>
                          {/* Via de eigen beveiligde proxy: geen Twilio-login nodig. */}
                          <audio controls preload="none" src={`/api/admin/telephony/recording/${c.id}`} className="h-9 w-full max-w-sm" />
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
