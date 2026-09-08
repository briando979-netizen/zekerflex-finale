"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface Lead {
  id: string;
  companyName: string;
  kvkNumber: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  city: string | null;
  sector: string | null;
  status: string;
  notes: string | null;
  invitedAt: string | null;
  createdAt: string;
}

const STATUS_LABEL: Record<string, string> = {
  NEW: "Nieuw",
  ENRICHED: "Verrijkt",
  DRAFTED: "Concept-mail",
  APPROVED: "Goedgekeurd",
  SENT: "Uitnodiging verstuurd",
  REPLIED: "Reactie ontvangen",
  WON: "Klant",
  LOST: "Afgehaakt",
  DISQUALIFIED: "Niet passend",
};

export function LeadWorkspace() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/sales/leads", { cache: "no-store" });
      const d = await r.json();
      setLeads(Array.isArray(d.leads) ? d.leads : []);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="grid gap-8 lg:grid-cols-[380px_1fr]">
      <NewVisitForm onCreated={load} />
      <div>
        <h2 className="font-display text-lg font-bold text-ink">Mijn bezoeken</h2>
        {loading ? (
          <p className="mt-3 text-sm text-neutralx-400">Laden…</p>
        ) : leads.length === 0 ? (
          <p className="mt-3 rounded-xl border border-hair bg-white p-6 text-sm text-neutralx-500">
            Nog geen bezoeken vastgelegd. Vul links het formulier in.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {leads.map((l) => (
              <LeadCard key={l.id} lead={l} onChange={load} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function NewVisitForm({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState({
    companyName: "",
    kvkNumber: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    city: "",
    sector: "",
    notes: "",
  });
  const [hits, setHits] = useState<{ kvkNumber: string; name: string; city?: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: "ok" | "err"; s: string } | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function onCompany(v: string) {
    set("companyName", v);
    if (debounce.current) clearTimeout(debounce.current);
    if (v.trim().length < 2) return setHits([]);
    debounce.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/company/search?q=${encodeURIComponent(v)}`);
        const d = await r.json();
        setHits(Array.isArray(d.results) ? d.results : []);
        setOpen(true);
      } catch {
        setHits([]);
      }
    }, 300);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const body = Object.fromEntries(Object.entries(form).filter(([, v]) => v.trim() !== ""));
      const r = await fetch("/api/sales/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error?.message ?? "Opslaan mislukt");
      setMsg({ t: "ok", s: `${d.lead.companyName} toegevoegd` });
      setForm({ companyName: "", kvkNumber: "", contactName: "", contactEmail: "", contactPhone: "", city: "", sector: "", notes: "" });
      onCreated();
    } catch (err) {
      setMsg({ t: "err", s: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="h-fit rounded-2xl border border-hair bg-white p-5 shadow-card">
      <h2 className="font-display text-lg font-bold text-ink">Nieuw bedrijfsbezoek</h2>
      <p className="mt-1 text-xs text-neutralx-500">Leg het bedrijf en de contactpersoon vast — daarna kun je meteen een account versturen.</p>

      <div className="relative mt-4">
        <label className="field-label">Bedrijfsnaam</label>
        <input
          required
          value={form.companyName}
          onChange={(e) => onCompany(e.target.value)}
          onFocus={() => hits.length && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          className="field-input"
          placeholder="Zoek in het Handelsregister…"
        />
        {open && hits.length > 0 && (
          <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-hair bg-white shadow-lift">
            {hits.map((h) => (
              <li key={h.kvkNumber}>
                <button
                  type="button"
                  onClick={() => {
                    set("companyName", h.name);
                    set("kvkNumber", h.kvkNumber);
                    if (h.city) set("city", h.city);
                    setOpen(false);
                  }}
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-paper-soft"
                >
                  <span className="font-medium text-ink">{h.name}</span>
                  <span className="ml-2 text-xs text-neutralx-400">
                    KVK {h.kvkNumber}
                    {h.city ? ` · ${h.city}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="field-label">
          KVK-nummer
          <input value={form.kvkNumber} onChange={(e) => set("kvkNumber", e.target.value)} className="field-input" placeholder="8 cijfers" />
        </label>
        <label className="field-label">
          Plaats
          <input value={form.city} onChange={(e) => set("city", e.target.value)} className="field-input" />
        </label>
      </div>

      <label className="field-label mt-3 block">
        Contactpersoon
        <input value={form.contactName} onChange={(e) => set("contactName", e.target.value)} className="field-input" />
      </label>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="field-label">
          E-mail
          <input type="email" value={form.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} className="field-input" placeholder="voor de uitnodiging" />
        </label>
        <label className="field-label">
          Telefoon
          <input value={form.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} className="field-input" />
        </label>
      </div>
      <label className="field-label mt-3 block">
        Branche
        <input value={form.sector} onChange={(e) => set("sector", e.target.value)} className="field-input" placeholder="bijv. supermarkt, horeca, logistiek" />
      </label>
      <label className="field-label mt-3 block">
        Notities van het bezoek
        <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={3} className="field-input" />
      </label>

      {msg && <p className={`mt-3 text-sm ${msg.t === "ok" ? "text-ok" : "text-crit"}`}>{msg.s}</p>}
      <button type="submit" disabled={busy} className="btn-primary mt-4 w-full disabled:opacity-50">
        {busy ? "Opslaan…" : "Bezoek vastleggen"}
      </button>
    </form>
  );
}

function LeadCard({ lead, onChange }: { lead: Lead; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const canInvite = !["SENT", "REPLIED", "WON"].includes(lead.status);

  async function invite() {
    setBusy(true);
    setNote("");
    try {
      const r = await fetch(`/api/sales/leads/${lead.id}/invite`, { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error?.message ?? "Versturen mislukt");
      setNote(d.inviteUrl ? "Verstuurd. Link ook gekopieerd." : "Uitnodiging verstuurd.");
      if (d.inviteUrl) navigator.clipboard?.writeText(d.inviteUrl).catch(() => undefined);
      onChange();
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-2xl border border-hair bg-white p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-display text-sm font-bold text-ink">{lead.companyName}</p>
          <p className="mt-0.5 text-xs text-neutralx-500">
            {[lead.city, lead.sector, lead.kvkNumber ? `KVK ${lead.kvkNumber}` : null].filter(Boolean).join(" · ")}
          </p>
          {(lead.contactName || lead.contactEmail || lead.contactPhone) && (
            <p className="mt-1 text-xs text-neutralx-500">
              {[lead.contactName, lead.contactEmail, lead.contactPhone].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        <span className="flex-shrink-0 rounded-full bg-paper-soft px-2 py-0.5 text-[11px] font-semibold text-neutralx-600">
          {STATUS_LABEL[lead.status] ?? lead.status}
        </span>
      </div>
      {lead.notes && <p className="mt-2 text-xs leading-relaxed text-neutralx-500">{lead.notes}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {canInvite ? (
          <button
            type="button"
            onClick={invite}
            disabled={busy || !lead.contactEmail}
            className="btn-primary px-3 py-1.5 text-xs disabled:opacity-40"
            title={lead.contactEmail ? "" : "Vul eerst een e-mailadres in"}
          >
            {busy ? "Versturen…" : "Account aanmaken & versturen"}
          </button>
        ) : (
          <span className="text-xs text-neutralx-500">
            Uitnodiging verstuurd{lead.invitedAt ? ` op ${new Date(lead.invitedAt).toLocaleDateString("nl-NL")}` : ""}
          </span>
        )}
        <a
          href="/uitleg"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-semibold text-brand-600 underline"
        >
          Uitlegfilmpjes tonen
        </a>
      </div>
      {note && <p className="mt-2 text-xs text-neutralx-500">{note}</p>}
    </li>
  );
}
