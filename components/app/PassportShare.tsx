"use client";

import { useState, type ReactNode } from "react";

export function PassportShare({
  initialEnabled,
  url,
  token,
  qr,
}: {
  initialEnabled: boolean;
  url: string;
  token: string;
  qr: ReactNode;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const toggle = async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/me/paspoort", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !enabled }),
      });
      if (r.ok) setEnabled(!enabled);
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="rounded-2xl border border-neutralx-200 bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-semibold">Deel je werkpaspoort</h2>
          <p className="mt-1 text-sm text-neutralx-600">
            Een openbare, geverifieerde pagina met je werkhistorie, vaardigheden en certificaten — met een echtheidszegel.
            Jij bepaalt of de link werkt.
          </p>
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          aria-pressed={enabled}
          className={`relative h-7 w-12 flex-shrink-0 rounded-full transition disabled:opacity-50 ${enabled ? "bg-brand-500" : "bg-neutralx-300"}`}
        >
          <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${enabled ? "left-[22px]" : "left-0.5"}`} />
        </button>
      </div>

      {enabled ? (
        <div className="mt-5 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <input
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-lg border border-neutralx-200 bg-neutralx-50 px-3 py-2 text-sm text-neutralx-700"
            />
            <button type="button" onClick={copy} className="btn-primary text-sm">
              {copied ? "Gekopieerd ✓" : "Kopieer link"}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-5">
            <span className="rounded-xl border border-neutralx-200 bg-white p-2">{qr}</span>
            <div className="flex flex-col gap-2 text-sm">
              <a href={url} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-600 hover:underline">
                Bekijk je openbare paspoort →
              </a>
              <a href={`/paspoort/${token}/pdf`} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-600 hover:underline">
                Download als PDF →
              </a>
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-4 rounded-lg bg-neutralx-50 p-3 text-sm text-neutralx-500">
          Je paspoort staat op privé. Zet de schakelaar aan om een deelbare link te krijgen — de link is niet te raden en
          wordt niet door zoekmachines geïndexeerd.
        </p>
      )}
    </div>
  );
}
