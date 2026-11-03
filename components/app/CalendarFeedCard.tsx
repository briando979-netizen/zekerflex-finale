"use client";

import { useState } from "react";
import { copyText } from "@/lib/clipboard";

// "Diensten in je eigen agenda": één abonnementslink voor Google Agenda,
// Apple Agenda en Outlook. De agenda-app haalt hem zelf periodiek op, dus
// nieuwe en afgezegde diensten komen vanzelf goed (lib/worker/calendar-feed).
export function CalendarFeedCard({ initialUrl }: { initialUrl: string }) {
  const [url, setUrl] = useState(initialUrl);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [renewed, setRenewed] = useState(false);

  const webcal = url.replace(/^https?:/, "webcal:");
  const google = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`;
  const outlook = `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(url)}&name=${encodeURIComponent("ZekerFlex diensten")}`;

  const copy = async () => {
    try {
      await copyText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  };

  const renew = async () => {
    if (!window.confirm("Een nieuwe link maken? De oude link werkt dan meteen niet meer, ook niet in agenda's waar je hem al gebruikt.")) return;
    setBusy(true);
    try {
      const r = await fetch("/api/me/agenda-link", { method: "POST" });
      if (r.ok) {
        setUrl(((await r.json()) as { url: string }).url);
        setRenewed(true);
      }
    } finally {
      setBusy(false);
    }
  };

  const button = "rounded-lg border border-neutralx-200 px-3.5 py-2 text-sm font-semibold text-ink hover:bg-neutralx-50";

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-neutralx-200 bg-white p-5">
        <h2 className="font-display text-lg font-semibold">Kies je agenda</h2>
        <p className="mt-1 text-sm text-neutralx-600">
          Eén keer koppelen, daarna staan al je diensten er vanzelf in: met adres, pauze en een herinnering. Een afgezegde
          dienst verdwijnt ook weer.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a href={google} target="_blank" rel="noopener noreferrer" className="btn-primary text-sm">
            Google Agenda
          </a>
          <a href={webcal} className={button}>
            Apple Agenda (iPhone, Mac)
          </a>
          <a href={outlook} target="_blank" rel="noopener noreferrer" className={button}>
            Outlook
          </a>
        </div>
      </div>

      <div className="rounded-2xl border border-neutralx-200 bg-white p-5">
        <h2 className="font-display text-base font-semibold">Andere agenda-app</h2>
        <p className="mt-1 text-sm text-neutralx-600">Kopieer de link en kies in je agenda &quot;Abonneren op agenda&quot; of &quot;Agenda toevoegen via URL&quot;.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label htmlFor="agenda-link" className="sr-only">
            Je agenda-link
          </label>
          <input
            id="agenda-link"
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            className="min-w-0 flex-1 rounded-lg border border-neutralx-200 bg-neutralx-50 px-3 py-2 text-sm text-neutralx-700"
          />
          <button type="button" onClick={copy} className="btn-primary text-sm">
            {copied ? "Gekopieerd ✓" : "Kopieer link"}
          </button>
        </div>
        {renewed && (
          <p role="status" className="mt-3 rounded-lg border border-brand-200 bg-brand-50 p-3 text-sm text-brand-700">
            Nieuwe link gemaakt. Koppel je agenda opnieuw; de oude link werkt niet meer.
          </p>
        )}
      </div>

      <div className="rounded-xl bg-paper-soft p-4 text-xs leading-relaxed text-neutralx-600">
        <span className="font-semibold text-ink">Houd de link voor jezelf. </span>
        Wie hem heeft, ziet je diensten (tijden, opdrachtgever en adres). Gedeeld per ongeluk?{" "}
        <button type="button" onClick={renew} disabled={busy} className="font-semibold text-brand-600 hover:underline disabled:opacity-50">
          Maak een nieuwe link
        </button>
        . Agenda-apps verversen zelf, meestal binnen een paar uur; Google kan er soms een halve dag over doen.
      </div>
    </div>
  );
}
