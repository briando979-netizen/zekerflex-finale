"use client";

import { useEffect, useState } from "react";
import { copyText } from "@/lib/clipboard";

/** Link / unlink the owner's desktop Jarvis (deploy/jarvis-desktop). The token is shown once. */
export function CompanionLink({ baseUrl }: { baseUrl: string }) {
  const [status, setStatus] = useState<{ linked: boolean; createdAt?: string; lastUsedAt?: string } | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const load = () =>
    fetch("/api/admin/companion", { cache: "no-store" })
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => undefined);
  useEffect(() => {
    void load();
  }, []);

  async function create() {
    if (status?.linked && !window.confirm("Nieuwe sleutel maken? De oude werkt daarna niet meer.")) return;
    setBusy(true);
    const r = await fetch("/api/admin/companion", { method: "POST" })
      .then((x) => x.json())
      .catch(() => null);
    setBusy(false);
    if (r?.token) setToken(r.token);
    void load();
  }
  async function revoke() {
    if (!window.confirm("Laptop-Jarvis ontkoppelen?")) return;
    await fetch("/api/admin/companion", { method: "DELETE" });
    setToken(null);
    void load();
  }

  const envText = token ? `ZEKERFLEX_URL=${baseUrl}\nZEKERFLEX_TOKEN=${token}` : "";
  return (
    <div className="space-y-4">
      <div className="card p-5">
        <p className="text-sm">
          Status: {status?.linked ? <strong className="text-ok">gekoppeld</strong> : <strong>nog niet gekoppeld</strong>}
          {status?.lastUsedAt && (
            <span className="text-neutralx-500"> · laatst gebruikt {new Date(status.lastUsedAt).toLocaleString("nl-NL")}</span>
          )}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={create} disabled={busy} className="btn-primary text-sm">
            {status?.linked ? "Nieuwe sleutel maken" : "Laptop-Jarvis koppelen"}
          </button>
          {status?.linked && (
            <button type="button" onClick={revoke} className="btn-ghost text-sm text-crit">
              Ontkoppelen
            </button>
          )}
        </div>
      </div>
      {token && (
        <div className="card border-warn/40 bg-warn/5 p-5 text-sm">
          <p className="font-semibold">Kopieer dit nu — de sleutel wordt maar één keer getoond.</p>
          <p className="mt-1 text-neutralx-600">
            Zet deze twee regels in het bestand <code>.env</code> in de map <code>jarvis-desktop</code> op je laptop:
          </p>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-ink p-3 font-mono text-xs text-white">{envText}</pre>
          <button type="button" onClick={async () => setCopied(await copyText(envText))} className="btn-ghost mt-3 text-sm">
            {copied ? "Gekopieerd ✓" : "Kopiëren"}
          </button>
        </div>
      )}
    </div>
  );
}
