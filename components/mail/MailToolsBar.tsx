"use client";

import { useEffect, useState } from "react";

interface Template {
  id: string;
  name: string;
  subject: string;
  body: string;
}
interface Tools {
  signature: string;
  appendSignature: boolean;
  templates: Template[];
  me?: string;
}

/**
 * Above a compose box: insert a template (fills {datum} and {mijnnaam};
 * {naam} is highlighted for you to complete), manage templates, and set the
 * signature that's appended on send.
 */
export function MailToolsBar({ onInsert, company = "" }: { onInsert: (t: { subject: string; body: string }) => void; company?: string }) {
  const [tools, setTools] = useState<Tools | null>(null);
  const [panel, setPanel] = useState<null | "manage" | "signature">(null);
  const [draft, setDraft] = useState<Template>({ id: "", name: "", subject: "", body: "" });
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/me/mail-tools", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setTools(d));
  }, []);

  async function save(next: Tools) {
    setTools(next);
    const r = await fetch("/api/me/mail-tools", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ signature: next.signature, appendSignature: next.appendSignature, templates: next.templates }) }).catch(() => null);
    setMsg(r?.ok ? "Opgeslagen." : "Opslaan lukte niet.");
    setTimeout(() => setMsg(null), 2000);
  }

  if (!tools) return null;
  const fill = (s: string) =>
    s
      .replace(/\{datum\}/g, new Date().toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" }))
      .replace(/\{mijnnaam\}/g, tools.me ?? "")
      .replace(/\{bedrijf\}/g, company);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <select
          value=""
          onChange={(e) => {
            const t = tools.templates.find((x) => x.id === e.target.value);
            if (t) onInsert({ subject: fill(t.subject), body: fill(t.body) });
          }}
          className="rounded-lg border border-hairstrong bg-white px-2 py-1.5"
        >
          <option value="">📄 Sjabloon invoegen…</option>
          {tools.templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => setPanel(panel === "manage" ? null : "manage")} className="rounded-lg border border-hairstrong px-2 py-1.5 hover:bg-paper-soft">
          Sjablonen beheren
        </button>
        <button type="button" onClick={() => setPanel(panel === "signature" ? null : "signature")} className="rounded-lg border border-hairstrong px-2 py-1.5 hover:bg-paper-soft">
          ✍️ Handtekening{tools.appendSignature && tools.signature ? " (aan)" : ""}
        </button>
        {msg && <span className="text-neutralx-500">{msg}</span>}
      </div>

      {panel === "signature" && (
        <div className="space-y-2 rounded-xl border border-hair bg-paper-soft/60 p-3 text-sm">
          <textarea value={tools.signature} onChange={(e) => setTools({ ...tools, signature: e.target.value })} rows={4} placeholder={"Met vriendelijke groet,\nJouw naam\nFunctie — Bedrijf\n06 12 34 56 78"} className="w-full rounded-lg border border-hairstrong bg-white px-3 py-2 text-sm" />
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={tools.appendSignature} onChange={(e) => setTools({ ...tools, appendSignature: e.target.checked })} />
            Automatisch onder elke mail zetten
          </label>
          <button type="button" onClick={() => save(tools)} className="btn-primary text-xs">
            Handtekening opslaan
          </button>
        </div>
      )}

      {panel === "manage" && (
        <div className="space-y-3 rounded-xl border border-hair bg-paper-soft/60 p-3 text-sm">
          <p className="text-xs text-neutralx-500">
            Gebruik <code>{"{naam}"}</code> (vul je zelf in), <code>{"{datum}"}</code>, <code>{"{mijnnaam}"}</code> en <code>{"{bedrijf}"}</code>.
          </p>
          <ul className="divide-y divide-hair rounded-lg border border-hair bg-white">
            {tools.templates.map((t) => (
              <li key={t.id} className="flex items-center gap-2 px-3 py-2 text-xs">
                <span className="flex-1 font-medium">{t.name}</span>
                <button type="button" onClick={() => setDraft(t)} className="text-brand-600 hover:underline">
                  Bewerken
                </button>
                <button type="button" onClick={() => save({ ...tools, templates: tools.templates.filter((x) => x.id !== t.id) })} className="text-neutralx-500 hover:text-crit">
                  Verwijderen
                </button>
              </li>
            ))}
          </ul>
          <div className="space-y-2">
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Naam van het sjabloon" className="w-full rounded-lg border border-hairstrong bg-white px-3 py-1.5 text-sm" />
            <input value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} placeholder="Onderwerp" className="w-full rounded-lg border border-hairstrong bg-white px-3 py-1.5 text-sm" />
            <textarea value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} rows={5} placeholder="Tekst" className="w-full rounded-lg border border-hairstrong bg-white px-3 py-1.5 text-sm" />
            <button
              type="button"
              disabled={!draft.name.trim() || !draft.body.trim()}
              onClick={() => {
                const id = draft.id || `t-${Date.now().toString(36)}`;
                const rest = tools.templates.filter((x) => x.id !== id);
                void save({ ...tools, templates: [...rest, { ...draft, id }] });
                setDraft({ id: "", name: "", subject: "", body: "" });
              }}
              className="btn-primary text-xs disabled:opacity-50"
            >
              {draft.id ? "Sjabloon bijwerken" : "Sjabloon toevoegen"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
