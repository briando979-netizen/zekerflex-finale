"use client";

import { useEffect, useState } from "react";
import { count, dateNl, euroExact } from "@/lib/admin/format";
import { Empty, KpiStrip, Meter, Panel, Pill } from "@/components/admin/kit";

interface Vac {
  id: string;
  title: string;
  city: string;
  startsAt: string;
  hourlyRateCents: number;
  positions: number;
  candidateCount: number;
}
interface Reason {
  label: string;
  strength: "goed" | "ok" | "zwak";
  detail: string;
}
interface Cert {
  type: string;
  status: string;
  expiresOn: string | null;
}
interface Cand {
  freelancerId: string;
  userId: string;
  name: string;
  scorePct: number;
  verdict: string;
  reasons: Reason[];
  travelMinutes: number;
  status: string;
  certificates: Cert[];
}
type Channel = "whatsapp" | "email" | "chat";
interface Draft {
  channel: Channel;
  text: string;
  busy: boolean;
  aiUsed?: boolean;
}

const REASON_TONE: Record<Reason["strength"], string> = { goed: "var(--a-ok)", ok: "var(--a-axis)", zwak: "var(--a-crit)" };

export function RecruiterConsole() {
  const [vacancies, setVacancies] = useState<Vac[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Cand[] | null>(null);
  const [sourcing, setSourcing] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/admin/recruiter", { cache: "no-store" }).catch(() => null);
      if (res?.ok) setVacancies(((await res.json()) as { vacancies: Vac[] }).vacancies);
      else setVacancies([]);
    })();
  }, []);

  async function source(id: string) {
    setSelected(id);
    setSourcing(true);
    setCandidates(null);
    setDrafts({});
    try {
      const res = await fetch("/api/admin/recruiter/source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shiftId: id }),
      });
      const d = await res.json().catch(() => ({ candidates: [] }));
      setCandidates(res.ok ? (d.candidates as Cand[]) : []);
    } finally {
      setSourcing(false);
    }
  }

  function setDraft(fid: string, patch: Partial<Draft>) {
    setDrafts((prev) => ({ ...prev, [fid]: { channel: "whatsapp", text: "", busy: false, ...prev[fid], ...patch } }));
  }

  async function genDraft(c: Cand) {
    if (!selected) return;
    const channel = drafts[c.freelancerId]?.channel ?? "whatsapp";
    setDraft(c.freelancerId, { busy: true });
    try {
      const res = await fetch("/api/admin/recruiter/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shiftId: selected,
          freelancerId: c.freelancerId,
          channel,
          highlights: c.reasons.filter((r) => r.strength !== "zwak").map((r) => `${r.label}: ${r.detail}`).slice(0, 6),
        }),
      });
      const d = (await res.json().catch(() => ({}))) as { message?: string; aiUsed?: boolean };
      setDraft(c.freelancerId, { busy: false, text: d.message ?? "Kon geen concept maken.", ...(d.aiUsed !== undefined ? { aiUsed: d.aiUsed } : {}) });
    } catch {
      setDraft(c.freelancerId, { busy: false, text: "Netwerkfout bij het maken van het concept." });
    }
  }

  const list = vacancies ?? [];
  const current = list.find((v) => v.id === selected) ?? null;

  return (
    <div className="space-y-4">
      <KpiStrip
        items={[
          { label: "Open uitzend-vacatures", value: vacancies ? count(list.length) : "—" },
          { label: "Plekken te vullen", value: vacancies ? count(list.reduce((n, v) => n + v.positions, 0)) : "—" },
          { label: "Gescoorde kandidaten", value: vacancies ? count(list.reduce((n, v) => n + v.candidateCount, 0)) : "—", hint: "uit je eigen pool" },
          { label: "Shortlist", value: candidates ? count(candidates.length) : "—", hint: current ? current.title : "kies een vacature" },
        ]}
      />

      <div className="grid items-start gap-4 lg:grid-cols-[0.85fr_1.15fr]">
        <Panel flush title="Open uitzend-vacatures" subtitle="Kies een vacature om kandidaten te zoeken">
          {vacancies === null ? (
            <div className="mx-5 mb-5 h-24 animate-pulse rounded-lg" style={{ background: "var(--a-elev)" }} />
          ) : list.length === 0 ? (
            <Empty title="Geen open uitzend-vacatures" />
          ) : (
            <ul>
              {list.map((v) => {
                const on = selected === v.id;
                return (
                  <li key={v.id} style={{ borderTop: "1px solid var(--a-border)" }}>
                    <button
                      type="button"
                      onClick={() => void source(v.id)}
                      aria-current={on ? "true" : undefined}
                      className="w-full px-4 py-3 text-left text-[0.8125rem] transition-colors hover:bg-[var(--a-panel-2)] sm:px-5"
                      style={on ? { background: "var(--a-panel-2)", boxShadow: "inset 2px 0 0 var(--a-accent)" } : undefined}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-medium" style={{ color: "var(--a-text)" }}>{v.title}</span>
                        <span className="flex-shrink-0 text-xs" style={{ color: "var(--a-mute)" }}>{count(v.candidateCount)} kandidaten</span>
                      </span>
                      <span className="mt-0.5 block text-xs" style={{ color: "var(--a-mute)" }}>
                        {v.city}, {dateNl(v.startsAt, { weekday: "short", day: "numeric", month: "short" })}, {euroExact(v.hourlyRateCents)} per uur, {v.positions} {v.positions === 1 ? "plek" : "plekken"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel flush title="Shortlist" subtitle={current ? `${current.title}, ${current.city}` : "Kies links een vacature"}>
          {!selected ? (
            <Empty title="Nog geen vacature gekozen" body="De beste kandidaten uit je pool verschijnen hier, met uitleg waarom." />
          ) : sourcing ? (
            <div className="mx-5 mb-5 h-40 animate-pulse rounded-lg" style={{ background: "var(--a-elev)" }} />
          ) : candidates && candidates.length === 0 ? (
            <Empty title="Nog geen gescoorde kandidaten" body="De matching vult dit zodra er geschikte mensen zijn." />
          ) : (
            <ul>
              {(candidates ?? []).map((c) => {
                const d = drafts[c.freelancerId];
                return (
                  <li key={c.freelancerId} className="space-y-2.5 px-4 py-3.5 sm:px-5" style={{ borderTop: "1px solid var(--a-border)" }}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[0.8125rem] font-medium" style={{ color: "var(--a-text)" }}>{c.name}</span>
                      <Pill tone={c.scorePct >= 70 ? "ok" : c.scorePct >= 50 ? "plan" : "neutral"}>{c.verdict}</Pill>
                      <span className="ml-auto text-xs" style={{ color: "var(--a-mute)" }}>{c.travelMinutes} min reizen</span>
                    </div>
                    <Meter label="Match" value={c.scorePct} max={100} display={`${c.scorePct}%`} tone="ok" />
                    {c.certificates.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {c.certificates.map((cert, i) => (
                          <Pill key={i} tone={cert.status === "VERIFIED" ? "trust" : "neutral"}>{cert.type}{cert.status === "VERIFIED" ? ", gecontroleerd" : ""}</Pill>
                        ))}
                      </div>
                    )}
                    <ul className="space-y-0.5 text-xs" style={{ color: "var(--a-dim)" }}>
                      {c.reasons.map((r, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: REASON_TONE[r.strength] }} aria-hidden />
                          <span><span className="font-medium" style={{ color: "var(--a-text)" }}>{r.label}:</span> {r.detail}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="flex flex-wrap items-center gap-2">
                      <select value={d?.channel ?? "whatsapp"} onChange={(e) => setDraft(c.freelancerId, { channel: e.target.value as Channel })} aria-label="Kanaal" className="a-input !w-auto !py-1 text-xs">
                        <option value="whatsapp">WhatsApp</option>
                        <option value="email">E-mail</option>
                        <option value="chat">Chat</option>
                      </select>
                      <button type="button" onClick={() => void genDraft(c)} disabled={d?.busy} className="a-button text-xs">{d?.busy ? "Schrijven…" : "AI-concept schrijven"}</button>
                    </div>
                    {d?.text !== undefined && d.text !== "" && (
                      <div className="space-y-1.5">
                        <textarea value={d.text} onChange={(e) => setDraft(c.freelancerId, { text: e.target.value })} rows={4} aria-label={`Bericht aan ${c.name}`} className="a-input text-[0.8125rem]" />
                        <div className="flex flex-wrap items-center gap-2">
                          <button type="button" onClick={() => void navigator.clipboard?.writeText(d.text)} className="a-button text-xs">Kopiëren</button>
                          {d.aiUsed === false && <span className="text-xs" style={{ color: "var(--a-mute)" }}>Sjabloon: de AI-node was niet bereikbaar.</span>}
                          <span className="text-xs" style={{ color: "var(--a-mute)" }}>Jij controleert en verstuurt zelf.</span>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
