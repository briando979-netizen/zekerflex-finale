"use client";

import { useState } from "react";
import { copyText } from "@/lib/clipboard";
import { useFT } from "@/components/i18n/useFT";

// "Diensten in je eigen agenda": één abonnementslink voor Google Agenda,
// Apple Agenda en Outlook. De agenda-app haalt hem zelf periodiek op, dus
// nieuwe en afgezegde diensten komen vanzelf goed (lib/worker/calendar-feed).
export function CalendarFeedCard({ initialUrl }: { initialUrl: string }) {
  const t = useFT().feed;
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
    if (!window.confirm(t.renewConfirm)) return;
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

  const button = "rounded-lg border border-hair px-3.5 py-2 text-sm font-semibold text-ink hover:bg-neutralx-50";

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-hair bg-white p-5">
        <h2 className="font-display text-lg font-semibold">{t.chooseTitle}</h2>
        <p className="mt-1 text-sm text-neutralx-600">{t.chooseBody}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a href={google} target="_blank" rel="noopener noreferrer" className="btn-primary text-sm">
            {t.google}
          </a>
          <a href={webcal} className={button}>
            {t.apple}
          </a>
          <a href={outlook} target="_blank" rel="noopener noreferrer" className={button}>
            {t.outlook}
          </a>
        </div>
      </div>

      <div className="rounded-2xl border border-hair bg-white p-5">
        <h2 className="font-display text-base font-semibold">{t.otherTitle}</h2>
        <p className="mt-1 text-sm text-neutralx-600">{t.otherBody}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label htmlFor="agenda-link" className="sr-only">
            {t.linkLabel}
          </label>
          <input
            id="agenda-link"
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            className="min-w-0 flex-1 rounded-lg border border-hair bg-neutralx-50 px-3 py-2 text-sm text-neutralx-700"
          />
          <button type="button" onClick={copy} className="btn-primary text-sm">
            {copied ? t.copied : t.copy}
          </button>
        </div>
        {renewed && (
          <p role="status" className="mt-3 rounded-lg border border-hair bg-brand-50 p-3 text-sm text-brand-700">
            {t.renewed}
          </p>
        )}
      </div>

      <div className="rounded-xl bg-paper-soft p-4 text-xs leading-relaxed text-neutralx-600">
        <span className="font-semibold text-ink">{t.privateTitle} </span>
        {t.privateBody}{" "}
        <button type="button" onClick={renew} disabled={busy} className="font-semibold text-brand-600 hover:underline disabled:opacity-50">
          {t.renew}
        </button>
        {t.refreshNote}
      </div>
    </div>
  );
}
