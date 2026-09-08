"use client";

import { useMemo, useState } from "react";
import { APageHeader, APanel, AStat, APill, AButton } from "@/components/admin/ui";
import { IBriefcase, IRocket, IMail, IActivity } from "@/components/app/icons";

export type LeadDto = {
  id: string;
  companyName: string;
  kvkNumber: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  city: string | null;
  sector: string | null;
  source: string;
  status: string;
  score: number | null;
  scoreRationale: string | null;
  notes: string | null;
  vacancySignal?: string | null;
  sourceUrl?: string | null;
  sequenceStep?: number;
  nextActionAt?: string | null;
  invitedAt: string | null;
  lastContactedAt: string | null;
  createdAt: string;
  outreach: { id: string; status: string; subject: string; updatedAt: string } | null;
};

type OutreachDto = { id: string; status: string; subject: string; body: string };

const STATUS_LABEL: Record<string, string> = {
  NEW: "Nieuw",
  ENRICHED: "Verrijkt",
  QUEUED: "In wachtrij",
  DRAFTED: "Concept klaar",
  APPROVED: "Goedgekeurd",
  SENT: "Verstuurd",
  REPLIED: "Reactie ontvangen",
  BOUNCED: "Bounce",
  UNSUBSCRIBED: "Afgemeld",
  WON: "Gewonnen",
  LOST: "Verloren",
  DISQUALIFIED: "Afgevallen",
};

const STATUS_TONE: Record<string, "ok" | "warn" | "crit" | "neutral"> = {
  NEW: "neutral",
  ENRICHED: "neutral",
  QUEUED: "warn",
  DRAFTED: "warn",
  APPROVED: "warn",
  SENT: "ok",
  REPLIED: "ok",
  BOUNCED: "crit",
  UNSUBSCRIBED: "crit",
  WON: "ok",
  LOST: "crit",
  DISQUALIFIED: "crit",
};

const PIPELINE = ["NEW", "ENRICHED", "QUEUED", "DRAFTED", "APPROVED", "SENT", "REPLIED", "WON"] as const;

const SOURCE_LABEL: Record<string, string> = {
  manual: "Handmatig",
  kvkbase: "KVK-import",
  careers: "Vacaturepagina",
  import: "Import",
  "field-visit": "Bedrijfsbezoek",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
}

export function SalesDashboard({ initialLeads }: { initialLeads: LeadDto[] }) {
  const [leads, setLeads] = useState<LeadDto[]>(initialLeads);
  const [filter, setFilter] = useState<string>("ALL");
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [outreach, setOutreach] = useState<Record<string, OutreachDto>>({});
  const [showNew, setShowNew] = useState(false);

  const stats = useMemo(() => {
    const total = leads.length;
    const open = leads.filter((l) => !["WON", "LOST", "DISQUALIFIED"].includes(l.status)).length;
    const sent = leads.filter((l) => ["SENT", "REPLIED", "WON"].includes(l.status)).length;
    const won = leads.filter((l) => l.status === "WON").length;
    const avgScore = (() => {
      const s = leads.map((l) => l.score).filter((n): n is number => typeof n === "number");
      return s.length ? Math.round(s.reduce((a, b) => a + b, 0) / s.length) : null;
    })();
    return { total, open, sent, won, avgScore };
  }, [leads]);

  const shown = useMemo(() => {
    const rows = filter === "ALL" ? leads : leads.filter((l) => l.status === filter);
    return [...rows].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  }, [leads, filter]);

  async function patchLead(
    id: string,
    action: "enrich" | "score" | "draft" | "mark-replied" | "mark-bounced" | "suppress",
  ) {
    setBusy(`${id}:${action}`);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/sales/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data?.error?.message ?? "Actie mislukt.");
        return;
      }
      if (action === "draft") {
        setOutreach((o) => ({ ...o, [id]: data.outreach }));
        setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, status: "DRAFTED", outreach: { id: data.outreach.id, status: data.outreach.status, subject: data.outreach.subject, updatedAt: new Date().toISOString() } } : l)));
        setMsg("Concept-mail gegenereerd — controleer en keur goed.");
      } else {
        const l: LeadDto = { ...data.lead, invitedAt: data.lead.invitedAt ?? null, lastContactedAt: data.lead.lastContactedAt ?? null, createdAt: data.lead.createdAt, outreach: leads.find((x) => x.id === id)?.outreach ?? null };
        setLeads((ls) => ls.map((x) => (x.id === id ? { ...x, ...l } : x)));
        const done: Record<string, string> = {
          enrich: "Lead verrijkt vanuit het Handelsregister.",
          score: "Fit-score bijgewerkt.",
          "mark-replied": "Gemarkeerd als 'reactie ontvangen' — sequence gestopt.",
          "mark-bounced": "Gemarkeerd als bounce — adres onderdrukt.",
          suppress: "Lead onderdrukt en gediskwalificeerd.",
        };
        setMsg(done[action] ?? "Bijgewerkt.");
      }
    } catch {
      setMsg("Netwerkfout.");
    } finally {
      setBusy(null);
    }
  }

  async function patchOutreach(leadId: string, oId: string, action: "approve" | "sent" | "send" | "discard") {
    setBusy(`${leadId}:${action}`);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/sales/outreach/${oId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data?.error?.message ?? "Actie mislukt.");
        return;
      }
      if (action === "send") {
        const ok = data.outcome?.status === "sent";
        setOutreach((o) => ({ ...o, [leadId]: { ...(o[leadId] as OutreachDto), status: ok ? "SENT" : "FAILED" } }));
        setLeads((ls) => ls.map((l) => (l.id === leadId ? { ...l, status: ok ? "SENT" : l.status } : l)));
        setMsg(ok ? "Mail verstuurd." : `Niet verstuurd: ${data.outcome?.reason ?? "onbekend"}`);
        return;
      }
      if (action === "discard") {
        setOutreach((o) => ({ ...o, [leadId]: { ...(o[leadId] as OutreachDto), status: "DISCARDED" } }));
        setMsg("Concept weggegooid.");
        return;
      }
      setOutreach((o) => ({ ...o, [leadId]: { ...(o[leadId] as OutreachDto), status: data.outreach.status } }));
      setLeads((ls) => ls.map((l) => (l.id === leadId ? { ...l, status: action === "approve" ? "APPROVED" : "SENT" } : l)));
      setMsg(action === "approve" ? "Concept goedgekeurd — klaar om te versturen." : "Gemarkeerd als verstuurd.");
    } catch {
      setMsg("Netwerkfout.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <APageHeader
        title="Sales-pijplijn"
        subtitle="Leads van buitendienst en import — verrijken, scoren, benaderen en opvolgen."
        badge={`${stats.open} open`}
        action={<AButton onClick={() => setShowNew((v) => !v)} icon={<IBriefcase />}>Nieuwe lead</AButton>}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AStat label="Totaal leads" value={stats.total} icon={<IBriefcase />} sub={`${stats.open} nog open`} />
        <AStat label="Benaderd" value={stats.sent} icon={<IMail />} sub="verstuurd of reactie" />
        <AStat label="Gewonnen" value={stats.won} icon={<IRocket />} sub="account aangemaakt" />
        <AStat label="Gem. fit-score" value={stats.avgScore ?? "–"} icon={<IActivity />} sub="0–100" />
      </div>

      {showNew && <NewLeadForm onCreated={(l) => { setLeads((ls) => [l, ...ls]); setShowNew(false); setMsg("Lead toegevoegd."); }} />}

      {msg && (
        <div className="rounded-xl px-4 py-2.5 text-sm" style={{ background: "var(--a-elev)", color: "var(--a-dim)" }}>
          {msg}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {(["ALL", ...PIPELINE, "LOST", "DISQUALIFIED"] as string[]).map((s) => {
          const count = s === "ALL" ? leads.length : leads.filter((l) => l.status === s).length;
          const active = filter === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setFilter(s)}
              className="rounded-full px-3 py-1.5 text-xs font-medium transition"
              style={{
                background: active ? "var(--a-accent)" : "var(--a-panel-2)",
                color: active ? "#04140d" : "var(--a-dim)",
                border: "1px solid var(--a-border)",
              }}
            >
              {s === "ALL" ? "Alles" : STATUS_LABEL[s]} · {count}
            </button>
          );
        })}
      </div>

      <APanel pad={false}>
        {shown.length === 0 ? (
          <p className="p-8 text-center text-sm" style={{ color: "var(--a-mute)" }}>
            Geen leads in deze weergave.
          </p>
        ) : (
          <ul className="divide-y" style={{ borderColor: "var(--a-border)" }}>
            {shown.map((l) => {
              const isOpen = openId === l.id;
              const o = outreach[l.id] ?? null;
              return (
                <li key={l.id} style={{ borderColor: "var(--a-border)" }}>
                  <button
                    type="button"
                    onClick={() => setOpenId(isOpen ? null : l.id)}
                    className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition hover:brightness-110"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold" style={{ color: "var(--a-text)" }}>
                          {l.companyName}
                        </span>
                        <APill tone={STATUS_TONE[l.status] ?? "neutral"}>{STATUS_LABEL[l.status] ?? l.status}</APill>
                      </div>
                      <p className="mt-0.5 truncate text-xs" style={{ color: "var(--a-mute)" }}>
                        {[l.sector, l.city, SOURCE_LABEL[l.source] ?? l.source].filter(Boolean).join(" · ") || "Geen sector bekend"}
                      </p>
                    </div>
                    {typeof l.score === "number" && (
                      <span
                        className="num rounded-lg px-2 py-1 text-xs font-bold"
                        style={{
                          background: l.score >= 60 ? "rgba(16,185,129,0.15)" : l.score >= 40 ? "rgba(245,158,11,0.15)" : "var(--a-elev)",
                          color: l.score >= 60 ? "#4ade80" : l.score >= 40 ? "#fbbf24" : "var(--a-dim)",
                        }}
                      >
                        {l.score}
                      </span>
                    )}
                    <span style={{ color: "var(--a-mute)" }}>{isOpen ? "▾" : "▸"}</span>
                  </button>

                  {isOpen && (
                    <div className="space-y-4 px-5 pb-5" style={{ background: "var(--a-panel-2)" }}>
                      <div className="grid gap-3 pt-1 sm:grid-cols-2">
                        <Field label="Contact" value={l.contactName ?? "—"} />
                        <Field label="E-mail" value={l.contactEmail ?? "—"} />
                        <Field label="Telefoon" value={l.contactPhone ?? "—"} />
                        <Field label="KVK" value={l.kvkNumber ?? "—"} />
                        <Field label="Toegevoegd" value={fmtDate(l.createdAt)} />
                        <Field label="Laatst benaderd" value={fmtDate(l.lastContactedAt)} />
                      </div>

                      {l.vacancySignal && (
                        <p className="rounded-lg px-3 py-2 text-xs" style={{ background: "var(--a-elev)", color: "var(--a-dim)" }}>
                          <span className="font-semibold">Vacature-signaal:</span> {l.vacancySignal}
                          {l.sourceUrl && (
                            <>
                              {" · "}
                              <a href={l.sourceUrl} target="_blank" rel="noreferrer" className="underline">bron</a>
                            </>
                          )}
                        </p>
                      )}
                      {typeof l.sequenceStep === "number" && l.sequenceStep > 0 && (
                        <p className="text-xs" style={{ color: "var(--a-mute)" }}>
                          Sequence: stap {l.sequenceStep}/3
                          {l.nextActionAt ? ` · volgende ${fmtDate(l.nextActionAt)}` : ""}
                        </p>
                      )}

                      {l.scoreRationale && (
                        <p className="rounded-lg px-3 py-2 text-xs" style={{ background: "var(--a-elev)", color: "var(--a-dim)" }}>
                          <span className="font-semibold">Fit-score {l.score}:</span> {l.scoreRationale}
                        </p>
                      )}
                      {l.notes && (
                        <p className="text-xs" style={{ color: "var(--a-mute)" }}>
                          <span className="font-semibold">Notitie:</span> {l.notes}
                        </p>
                      )}

                      {o && (
                        <div className="rounded-xl p-3" style={{ background: "var(--a-elev)", border: "1px solid var(--a-border)" }}>
                          <p className="text-xs font-semibold" style={{ color: "var(--a-text)" }}>
                            Concept-mail · {o.subject}
                          </p>
                          <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap text-[11px] leading-relaxed" style={{ color: "var(--a-dim)" }}>
                            {o.body}
                          </pre>
                        </div>
                      )}

                      {/* Slimme actieknoppen */}
                      <div className="flex flex-wrap gap-2">
                        <SmartBtn
                          label={busy === `${l.id}:enrich` ? "Bezig…" : "Verrijk via KVK"}
                          disabled={!l.kvkNumber || busy !== null}
                          onClick={() => patchLead(l.id, "enrich")}
                          hint={!l.kvkNumber ? "KVK-nummer ontbreekt" : undefined}
                        />
                        <SmartBtn
                          label={busy === `${l.id}:score` ? "Bezig…" : "Bereken fit-score"}
                          disabled={busy !== null}
                          onClick={() => patchLead(l.id, "score")}
                        />
                        <SmartBtn
                          label={busy === `${l.id}:draft` ? "Bezig…" : o ? "Concept opnieuw" : "Concept-mail schrijven"}
                          disabled={!l.contactEmail || busy !== null}
                          onClick={() => patchLead(l.id, "draft")}
                          hint={!l.contactEmail ? "E-mailadres ontbreekt" : undefined}
                        />
                        {o && o.status === "DRAFT" && (
                          <SmartBtn
                            label={busy === `${l.id}:approve` ? "Bezig…" : "Concept goedkeuren"}
                            primary
                            disabled={busy !== null}
                            onClick={() => patchOutreach(l.id, o.id, "approve")}
                          />
                        )}
                        {o && (o.status === "DRAFT" || o.status === "APPROVED") && (
                          <SmartBtn
                            label={busy === `${l.id}:send` ? "Bezig…" : "Verstuur nu"}
                            primary
                            disabled={busy !== null || !l.contactEmail}
                            onClick={() => patchOutreach(l.id, o.id, "send")}
                            hint={!l.contactEmail ? "E-mailadres ontbreekt" : undefined}
                          />
                        )}
                        {o && (o.status === "DRAFT" || o.status === "APPROVED") && (
                          <SmartBtn
                            label="Concept weggooien"
                            disabled={busy !== null}
                            onClick={() => patchOutreach(l.id, o.id, "discard")}
                          />
                        )}
                        {["SENT", "QUEUED"].includes(l.status) && (
                          <>
                            <SmartBtn
                              label={busy === `${l.id}:mark-replied` ? "Bezig…" : "Reactie ontvangen"}
                              disabled={busy !== null}
                              onClick={() => patchLead(l.id, "mark-replied")}
                            />
                            <SmartBtn
                              label={busy === `${l.id}:mark-bounced` ? "Bezig…" : "Bounce"}
                              disabled={busy !== null}
                              onClick={() => patchLead(l.id, "mark-bounced")}
                            />
                          </>
                        )}
                        <SmartBtn
                          label="Onderdrukken"
                          disabled={busy !== null}
                          onClick={() => patchLead(l.id, "suppress")}
                        />
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </APanel>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide" style={{ color: "var(--a-mute)" }}>{label}</p>
      <p className="mt-0.5 text-sm" style={{ color: "var(--a-dim)" }}>{value}</p>
    </div>
  );
}

function SmartBtn({
  label,
  onClick,
  disabled,
  primary,
  hint,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  hint?: string | undefined;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={hint}
      className="rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40"
      style={{
        background: primary ? "var(--a-accent)" : "var(--a-panel)",
        color: primary ? "#04140d" : "var(--a-dim)",
        border: "1px solid var(--a-border)",
      }}
    >
      {label}
    </button>
  );
}

function NewLeadForm({ onCreated }: { onCreated: (l: LeadDto) => void }) {
  const [form, setForm] = useState({ companyName: "", kvkNumber: "", contactName: "", contactEmail: "", city: "", sector: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const payload: Record<string, string> = { companyName: form.companyName.trim(), source: "manual" };
      for (const k of ["kvkNumber", "contactName", "contactEmail", "city", "sector", "notes"] as const) {
        if (form[k].trim()) payload[k] = form[k].trim();
      }
      const res = await fetch("/api/admin/sales/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data?.error?.message ?? "Aanmaken mislukt.");
        return;
      }
      onCreated({
        ...data.lead,
        invitedAt: null,
        lastContactedAt: null,
        createdAt: data.lead.createdAt ?? new Date().toISOString(),
        outreach: null,
      });
    } catch {
      setErr("Netwerkfout.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <APanel title="Nieuwe lead" subtitle="Bedrijf dat de buitendienst tegenkwam">
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <Input label="Bedrijfsnaam *" value={form.companyName} onChange={(v) => set("companyName", v)} required />
        <Input label="KVK-nummer" value={form.kvkNumber} onChange={(v) => set("kvkNumber", v)} placeholder="8 cijfers" />
        <Input label="Contactpersoon" value={form.contactName} onChange={(v) => set("contactName", v)} />
        <Input label="E-mail" value={form.contactEmail} onChange={(v) => set("contactEmail", v)} type="email" />
        <Input label="Plaats" value={form.city} onChange={(v) => set("city", v)} />
        <Input label="Sector" value={form.sector} onChange={(v) => set("sector", v)} />
        <label className="block sm:col-span-2">
          <span className="text-[11px] uppercase tracking-wide" style={{ color: "var(--a-mute)" }}>Notitie</span>
          <textarea
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-lg px-3 py-2 text-sm"
            style={{ background: "var(--a-panel-2)", color: "var(--a-text)", border: "1px solid var(--a-border)" }}
          />
        </label>
        {err && <p className="text-xs sm:col-span-2" style={{ color: "#fca5a5" }}>{err}</p>}
        <div className="sm:col-span-2">
          <AButton type="submit" disabled={busy || form.companyName.trim().length < 2}>
            {busy ? "Bezig…" : "Lead opslaan"}
          </AButton>
        </div>
      </form>
    </APanel>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
  required,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wide" style={{ color: "var(--a-mute)" }}>{label}</span>
      <input
        type={type}
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg px-3 py-2 text-sm"
        style={{ background: "var(--a-panel-2)", color: "var(--a-text)", border: "1px solid var(--a-border)" }}
      />
    </label>
  );
}
