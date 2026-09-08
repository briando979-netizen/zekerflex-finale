"use client";

import { useEffect, useRef, useState } from "react";
import {
  googleCalendarUrl,
  outlookCalendarUrl,
  type CalendarEvent,
} from "@/lib/calendar/links";

// ---------------------------------------------------------------------------
// "Zet in je agenda" — opens the viewer's actual calendar with the shift
// pre-filled. Google Calendar / Outlook.com open in a new tab with every
// field populated; "Apple Agenda / iCal" streams an .ics that the phone or
// laptop hands straight to its calendar app (inline, not a download). A
// plain-download fallback is offered too.
// ---------------------------------------------------------------------------

export interface AddToCalendarProps extends CalendarEvent {
  /** ShiftAssignment id — drives the /api .ics endpoint. */
  assignmentId: string;
  compact?: boolean;
}

export function AddToCalendarButton({ assignmentId, compact, ...event }: AddToCalendarProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const icsHref = `/api/me/assignments/${assignmentId}/ics`;

  const items: { label: string; sub: string; onClick: () => void }[] = [
    {
      label: "Google Agenda",
      sub: "Opent in je browser",
      onClick: () => window.open(googleCalendarUrl(event), "_blank", "noopener"),
    },
    {
      label: "Outlook",
      sub: "Opent outlook.com",
      onClick: () => window.open(outlookCalendarUrl(event), "_blank", "noopener"),
    },
    {
      label: "Apple Agenda / iCal",
      sub: "Opent je agenda-app",
      onClick: () => {
        window.location.href = icsHref;
      },
    },
    {
      label: "Download .ics-bestand",
      sub: "Voor elk ander programma",
      onClick: () => {
        window.location.href = `${icsHref}?dl=1`;
      },
    },
  ];

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={
          compact
            ? "inline-flex items-center gap-1.5 rounded-lg border border-hairstrong px-2.5 py-1.5 text-xs font-medium text-neutralx-600 hover:border-brand-400 hover:text-brand-700"
            : "btn-ghost px-3 py-2 text-sm"
        }
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="2" />
          <path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        Zet in je agenda
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-2 w-64 overflow-hidden rounded-xl border border-hair bg-white p-1.5 shadow-lift">
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              onClick={() => {
                setOpen(false);
                it.onClick();
              }}
              className="block w-full rounded-lg px-3 py-2 text-left hover:bg-paper-soft"
            >
              <span className="block text-sm font-medium text-ink">{it.label}</span>
              <span className="block text-[11px] text-neutralx-400">{it.sub}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
