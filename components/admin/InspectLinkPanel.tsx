"use client";

import { copyText } from "@/lib/clipboard";

import { useState } from "react";

interface Link {
  expiresAt: string;
  web: string;
  app: string;
  param: string;
}

/**
 * Admin: mint a read-only inspection link for a test account, so an AI
 * (Claude, ChatGPT, Gemini) or a screenshot script can look at the site and
 * the app view as that account without a password (lib/auth/inspect.ts).
 */
export function InspectLinkPanel({ userId }: { userId: string }) {
  const [hours, setHours] = useState(24);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<Link | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/gebruikers/${userId}/inspect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hours }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setError(d?.error?.message ?? "Aanmaken mislukt.");
      else setLink(d);
    } finally {
      setBusy(false);
    }
  }

  async function copy(label: string, text: string) {
    await copyText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  }

  const aiPrompt = link
    ? `Bekijk de ZekerFlex-app als testgebruiker (alleen-lezen). Open deze link: ${link.app}\nZet op elke pagina die je wilt bekijken "?${link.param}&app=1" achter het adres, bijvoorbeeld https://www.zekerflex.com/dashboard/klussen?${link.param}&app=1 . Vertel me wat je ziet en wat er niet goed werkt.`
    : "";

  return (
    <div className="space-y-3 px-5 py-4 text-sm">
      <p className="text-neutralx-600">
        Maak een geheime link waarmee een AI (Claude, ChatGPT, Gemini) of een screenshot-script de site en de app bekijkt als dit
        account — <strong>alleen-lezen</strong>, zonder wachtwoord. Alleen voor testaccounts; deel hem nergens openbaar.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-neutralx-500">
          Geldig{" "}
          <select value={hours} onChange={(e) => setHours(Number(e.target.value))} className="rounded border border-hairstrong px-1.5 py-1 text-xs">
            {[2, 24, 72].map((h) => (
              <option key={h} value={h}>
                {h} uur
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => void create()} disabled={busy} className="btn-ghost text-xs disabled:opacity-50">
          {busy ? "Bezig…" : "Maak inspectielink"}
        </button>
      </div>
      {error && <p className="text-xs text-crit">{error}</p>}
      {link && (
        <div className="space-y-2 rounded-lg border border-hair bg-paper-soft p-3 text-xs">
          <p className="text-neutralx-500">Geldig tot {new Date(link.expiresAt).toLocaleString("nl-NL")}</p>
          {(
            [
              ["App-weergave", link.app],
              ["Website-weergave", link.web],
              ["Opdracht voor ChatGPT / Gemini / Claude", aiPrompt],
            ] as const
          ).map(([label, text]) => (
            <div key={label}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-ink">{label}</span>
                <button type="button" onClick={() => void copy(label, text)} className="text-brand-600 underline">
                  {copied === label ? "gekopieerd" : "kopieer"}
                </button>
              </div>
              <p className="mt-0.5 break-all text-neutralx-600">{text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
