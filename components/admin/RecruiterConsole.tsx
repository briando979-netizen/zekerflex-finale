"use client";

import { useEffect, useState } from "react";

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

const euro = (c: number) => `€ ${(c / 100).toFixed(2).replace(".", ",")}`;
const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/Amsterdam" });
const reasonColor = (s: Reason["strength"]) => (s === "goed" ? "text-brand-600" : s === "zwak" ? "text-crit" : "text-neutralx-400");

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

  return (
    <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
      {/* vacatures */}
      <div className="card p-5">
        <p className="text-sm font-semibold text-ink">Openstaande uitzend-vacatures</p>
        <p className="mt-0.5 text-xs text-neutralx-500">Kies een vacature om kandidaten uit je eigen pool te sourcen.</p>
        <div className="mt-3 space-y-2">
          {vacancies === null ? (
            <div className="h-24 animate-pulse rounded-xl bg-paper-soft" />
          ) : vacancies.length === 0 ? (
            <p className="text-sm text-neutralx-500">Geen openstaande uitzend-vacatures.</p>
          ) : (
            vacancies.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => void source(v.id)}
                className={`w-full rounded-xl border p-3 text-left text-sm transition ${
                  selected === v.id ? "border-brand-600 bg-paper-soft" : "border-hairstrong hover:bg-paper-soft"
                }`}
              >
                <span className="block font-medium text-ink">{v.title}</span>
                <span className="block text-xs text-neutralx-500">
                  {v.city} · {dayLabel(v.startsAt)} · {euro(v.hourlyRateCents)}/u · {v.positions} plek{v.positions === 1 ? "" : "ken"} · {v.candidateCount} kandida{v.candidateCount === 1 ? "at" : "ten"}
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* shortlist */}
      <div className="card p-5">
        <p className="text-sm font-semibold text-ink">Shortlist</p>
        {!selected ? (
          <p className="mt-2 text-sm text-neutralx-500">Kies links een vacature.</p>
        ) : sourcing ? (
          <div className="mt-3 h-40 animate-pulse rounded-xl bg-paper-soft" />
        ) : candidates && candidates.length === 0 ? (
          <p className="mt-2 text-sm text-neutralx-500">Nog geen gescoorde kandidaten voor deze vacature. De matching vult dit zodra er geschikte mensen zijn.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {(candidates ?? []).map((c) => {
              const d = drafts[c.freelancerId];
              return (
                <li key={c.freelancerId} className="rounded-xl border border-hairstrong p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-ink">{c.name}</span>
                    <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[11px] font-semibold text-white">{c.scorePct}% · {c.verdict}</span>
                    <span className="text-xs text-neutralx-400">{c.travelMinutes} min reizen</span>
                  </div>
                  {c.certificates.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {c.certificates.map((cert, i) => (
                        <span key={i} className={`rounded px-1.5 py-0.5 text-[10px] ${cert.status === "VERIFIED" ? "bg-brand-600 text-white" : "bg-paper-soft text-neutralx-600"}`}>
                          {cert.type}
                          {cert.status === "VERIFIED" ? " ✓" : ""}
                        </span>
                      ))}
                    </div>
                  )}
                  <ul className="mt-2 space-y-0.5 text-xs text-neutralx-600">
                    {c.reasons.map((r, i) => (
                      <li key={i}>
                        <span className={reasonColor(r.strength)} aria-hidden>●</span> <span className="font-medium text-ink">{r.label}:</span> {r.detail}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <select
                      value={d?.channel ?? "whatsapp"}
                      onChange={(e) => setDraft(c.freelancerId, { channel: e.target.value as Channel })}
                      className="rounded-lg border border-hairstrong bg-white px-2 py-1 text-xs"
                    >
                      <option value="whatsapp">WhatsApp</option>
                      <option value="email">E-mail</option>
                      <option value="chat">Chat</option>
                    </select>
                    <button type="button" onClick={() => void genDraft(c)} disabled={d?.busy} className="btn-ghost text-xs disabled:opacity-50">
                      {d?.busy ? "Schrijven…" : "✎ AI-concept-bericht"}
                    </button>
                  </div>
                  {d?.text !== undefined && (
                    <div className="mt-2 space-y-1">
                      <textarea
                        value={d.text}
                        onChange={(e) => setDraft(c.freelancerId, { text: e.target.value })}
                        rows={4}
                        className="w-full rounded-lg border border-hairstrong bg-white px-3 py-2 text-sm"
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <button type="button" onClick={() => void navigator.clipboard?.writeText(d.text)} className="btn-ghost text-xs">Kopieer</button>
                        {d.aiUsed === false && <span className="text-[11px] text-neutralx-400">(sjabloon — AI-node was niet bereikbaar)</span>}
                        <span className="text-[11px] text-neutralx-400">Jij controleert en verstuurt zelf — de AI beslist niets.</span>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
