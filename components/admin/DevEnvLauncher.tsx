"use client";

import { useEffect, useState } from "react";

// Instelbare links naar de self-hosted web-VS-Code + web-terminal (deploy/code-server/).
interface Cfg {
  codeServerUrl: string;
  terminalUrl: string;
}

const inp = "w-full rounded-lg border border-hairstrong bg-white px-3 py-2 text-sm";
const lbl = "block text-xs font-medium text-neutralx-500 mb-1";

export function DevEnvLauncher() {
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/admin/devenv", { cache: "no-store" });
      if (res.ok) setCfg((await res.json()) as Cfg);
    })();
  }, []);

  async function save() {
    if (!cfg) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/devenv", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      });
      setMsg(res.ok ? "Opgeslagen." : "Opslaan mislukt.");
    } finally {
      setSaving(false);
    }
  }

  if (!cfg) return <div className="h-40 animate-pulse rounded-2xl bg-paper-soft" />;

  const open = (url: string) => {
    if (url.trim()) window.open(url.trim(), "_blank", "noopener");
  };

  return (
    <div className="card space-y-3 p-5">
      <div>
        <p className="text-sm font-semibold text-ink">Self-hosted VS Code &amp; terminal</p>
        <p className="mt-0.5 text-xs text-neutralx-500">
          De echte web-VS-Code (code-server) + web-terminal draaien op je eigen VPS — niet op Vercel. Setup-recept:
          <code className="ml-1">deploy/code-server/</code>. Vul hieronder je URL&apos;s in en open ze met één klik.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={lbl}>VS Code-URL (code-server)</label>
          <input className={inp} value={cfg.codeServerUrl} onChange={(e) => setCfg({ ...cfg, codeServerUrl: e.target.value })} placeholder="https://code.jouwdomein.nl" />
        </div>
        <div>
          <label className={lbl}>Terminal-URL (ttyd)</label>
          <input className={inp} value={cfg.terminalUrl} onChange={(e) => setCfg({ ...cfg, terminalUrl: e.target.value })} placeholder="https://term.jouwdomein.nl" />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={saving} className="btn-primary text-sm disabled:opacity-50">{saving ? "Opslaan…" : "Opslaan"}</button>
        <button type="button" onClick={() => open(cfg.codeServerUrl)} disabled={!cfg.codeServerUrl.trim()} className="btn-ghost text-sm disabled:opacity-40">Open VS Code ↗</button>
        <button type="button" onClick={() => open(cfg.terminalUrl)} disabled={!cfg.terminalUrl.trim()} className="btn-ghost text-sm disabled:opacity-40">Open terminal ↗</button>
        {msg && <span className="text-sm text-neutralx-600">{msg}</span>}
      </div>
    </div>
  );
}
