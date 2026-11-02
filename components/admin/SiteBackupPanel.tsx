"use client";

import { useCallback, useEffect, useState } from "react";
import { Notice, Pill } from "@/components/admin/kit";
import type { SiteBackupFile, SiteBackupState } from "@/lib/website/site-backup";
import type { DeployConfig } from "@/lib/website/deploy";

// Back-ups van een beheerde klantsite: servertoegang (map + test), elke nacht
// automatisch, nu maken, downloaden en terugzetten (met de huidige site bewaard).

const mb = (bytes: number) => (bytes >= 1e6 ? `${(bytes / 1e6).toLocaleString("nl-NL", { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(bytes / 1e3))} kB`);
const when = (iso: string) => new Date(iso).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function SiteBackupPanel({ siteId }: { siteId: string }) {
  const [state, setState] = useState<SiteBackupState | null>(null);
  const [files, setFiles] = useState<SiteBackupFile[]>([]);
  const [cfg, setCfg] = useState<DeployConfig | null>(null);
  const [webroot, setWebroot] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [b, m] = await Promise.all([
      fetch(`/api/admin/website/backup?siteId=${encodeURIComponent(siteId)}`, { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
      fetch(`/api/admin/website/mirror?siteId=${encodeURIComponent(siteId)}`, { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
    ]);
    setState(b.state ?? null);
    setFiles(b.files ?? []);
    setCfg(m.deployConfig ?? null);
    setWebroot((w) => w || m.deployConfig?.webroot || "~/public_html");
  }, [siteId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!state?.running) return;
    const t = setInterval(() => void load(), 3000);
    return () => clearInterval(t);
  }, [state?.running, load]);

  const post = async (url: string, body: object, label: string) => {
    setBusy(label);
    setMessage("");
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setMessage(data?.error?.message ?? "Mislukt.");
      else if (label === "test" && data.test?.result && !data.test.result.ok) setMessage(data.test.result.reason);
      else if (label === "restore") setMessage(`Teruggezet. De site van daarvoor staat bewaard in ${data.oldDir}.`);
      await load();
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  };

  const tested = Boolean(cfg?.testedAt && cfg.realWebroot);
  const last = state?.last;

  return (
    <div className="mt-4 space-y-3 rounded-xl border p-4" style={{ borderColor: "var(--a-border)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold" style={{ color: "var(--a-text)" }}>Back-ups</p>
        {state?.running ? (
          <Pill tone="plan">Back-up loopt…</Pill>
        ) : last ? (
          <Pill tone={last.ok ? "ok" : "crit"}>{last.ok ? `Laatste ${when(last.at)}` : "Laatste mislukt"}</Pill>
        ) : (
          <Pill tone="neutral">Nog geen back-up</Pill>
        )}
      </div>
      {message && <Notice tone="warn" role="alert">{message}</Notice>}

      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`bk-root-${siteId}`}>Map van de website op de server</label>
        <input id={`bk-root-${siteId}`} value={webroot} onChange={(e) => setWebroot(e.target.value)} className="a-input !w-64 font-mono text-xs" placeholder="~/public_html" />
        <button type="button" className="a-button text-xs" disabled={busy !== null || webroot === cfg?.webroot} onClick={() => void post("/api/admin/website/mirror", { action: "set-webroot", siteId, webroot }, "root")}>Map opslaan</button>
        <button type="button" className="a-button text-xs" disabled={busy !== null || !cfg?.webroot} onClick={() => void post("/api/admin/website/mirror", { action: "test-ssh", siteId }, "test")}>{busy === "test" ? "Testen…" : "Test verbinding (alleen lezen)"}</button>
        <button type="button" className="a-button a-button-primary text-xs" disabled={busy !== null || !tested || Boolean(state?.running)} onClick={() => void post("/api/admin/website/backup", { action: "now", siteId }, "now")}>Nu back-up maken</button>
      </div>
      <p className="text-xs" style={{ color: "var(--a-mute)" }}>
        {tested
          ? `Elke nacht automatisch; de nieuwste 7 blijven bewaard. Server ${cfg?.realWebroot}.`
          : "Stel de map in en test de verbinding; daarna maken we elke nacht een back-up."}
      </p>
      {last && !last.ok && last.error && <Notice tone="crit">{last.error}</Notice>}
      {state?.lastRestore && (
        <p className="text-xs" style={{ color: "var(--a-dim)" }}>
          Laatst teruggezet: {state.lastRestore.file} op {when(state.lastRestore.at)}
          {state.lastRestore.ok ? ` · de site van daarvoor staat in ${state.lastRestore.oldDir}` : ` · mislukt: ${state.lastRestore.error}`}
        </p>
      )}

      {files.length > 0 && (
        <ul className="divide-y rounded-lg border text-[0.8125rem]" style={{ borderColor: "var(--a-border)" }}>
          {files.map((f) => (
            <li key={f.name} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2" style={{ borderColor: "var(--a-border)" }}>
              <span style={{ color: "var(--a-text)" }}>{when(f.at)} <span className="font-mono text-xs" style={{ color: "var(--a-mute)" }}>· {mb(f.bytes)}</span></span>
              <span className="flex gap-2">
                <a className="a-button text-xs" href={`/api/admin/website/backup?siteId=${encodeURIComponent(siteId)}&download=${encodeURIComponent(f.name)}`}>Download</a>
                {confirm === f.name ? (
                  <>
                    <button type="button" className="a-button a-button-primary text-xs" disabled={busy !== null} onClick={() => void post("/api/admin/website/backup", { action: "restore", siteId, file: f.name }, "restore")}>
                      {busy === "restore" ? "Terugzetten…" : "Ja, zet deze terug"}
                    </button>
                    <button type="button" className="a-button text-xs" onClick={() => setConfirm(null)}>Annuleren</button>
                  </>
                ) : (
                  <button type="button" className="a-button text-xs" disabled={busy !== null || !tested} onClick={() => setConfirm(f.name)}>Terugzetten</button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
